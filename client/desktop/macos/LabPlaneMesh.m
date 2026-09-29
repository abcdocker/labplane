#import <Cocoa/Cocoa.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

static NSString *ShellQuote(NSString *value) {
    return [NSString stringWithFormat:@"'%@'", [value stringByReplacingOccurrencesOfString:@"'" withString:@"'\\''"]];
}

static NSString *AppleScriptQuote(NSString *value) {
    NSString *escaped = [value stringByReplacingOccurrencesOfString:@"\\" withString:@"\\\\"];
    return [escaped stringByReplacingOccurrencesOfString:@"\"" withString:@"\\\""];
}

static NSDictionary *Run(NSString *path, NSArray<NSString *> *arguments) {
    NSTask *task = [NSTask new];
    task.executableURL = [NSURL fileURLWithPath:path];
    task.arguments = arguments;
    NSPipe *pipe = [NSPipe pipe];
    task.standardOutput = pipe;
    task.standardError = pipe;
    NSError *error = nil;
    if (![task launchAndReturnError:&error]) {
        return @{@"code": @(-1), @"output": error.localizedDescription ?: @"无法启动程序"};
    }
    NSData *data = [pipe.fileHandleForReading readDataToEndOfFile];
    [task waitUntilExit];
    NSString *output = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"";
    return @{@"code": @(task.terminationStatus), @"output": output};
}

@interface MeshAppDelegate : NSObject <NSApplicationDelegate>
@property (strong) NSWindow *window;
@property (strong) NSTextField *statusLabel;
@property (strong) NSTextField *detailsLabel;
@property (strong) NSTextField *configLabel;
@property (strong) NSTextField *messageLabel;
@property (strong) NSURL *configURL;
@property (strong) NSButton *installButton;
@property (strong) NSButton *connectButton;
@property (strong) NSButton *startButton;
@property (strong) NSURL *platformURL;
@property (assign) BOOL installed;
@property (assign) BOOL complete;
@property (assign) BOOL busy;
@end

@implementation MeshAppDelegate

- (NSString *)agentPath {
    return [[[NSBundle mainBundle] resourceURL] URLByAppendingPathComponent:@"labplane-mesh-client"].path;
}

- (NSString *)installerPath {
    return [[[NSBundle mainBundle] resourceURL] URLByAppendingPathComponent:@"tailscale.pkg"].path;
}

- (NSTextField *)label:(NSString *)value frame:(NSRect)frame size:(CGFloat)size bold:(BOOL)bold {
    NSTextField *field = [[NSTextField alloc] initWithFrame:frame];
    field.stringValue = value;
    field.editable = NO;
    field.selectable = YES;
    field.bordered = NO;
    field.drawsBackground = NO;
    field.font = bold ? [NSFont boldSystemFontOfSize:size] : [NSFont systemFontOfSize:size];
    field.lineBreakMode = NSLineBreakByTruncatingTail;
    [self.window.contentView addSubview:field];
    return field;
}

- (NSButton *)button:(NSString *)title frame:(NSRect)frame action:(SEL)action {
    NSButton *button = [[NSButton alloc] initWithFrame:frame];
    button.title = title;
    button.target = self;
    button.action = action;
    button.bezelStyle = NSBezelStyleRounded;
    [self.window.contentView addSubview:button];
    return button;
}

- (void)addMenuItem:(NSMenu *)menu title:(NSString *)title action:(SEL)action {
    NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:title action:action keyEquivalent:@""];
    item.target = self;
    [menu addItem:item];
}

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    self.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 590, 400)
        styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable
        backing:NSBackingStoreBuffered defer:NO];
    self.window.title = @"LabPlane Mesh";
    [self.window center];
    NSImage *icon = [[NSImage alloc] initWithContentsOfFile:[[[NSBundle mainBundle] resourceURL] URLByAppendingPathComponent:@"AppIcon.icns"].path];
    NSImageView *iconView = [[NSImageView alloc] initWithFrame:NSMakeRect(24, 328, 48, 48)];
    iconView.image = icon;
    [self.window.contentView addSubview:iconView];
    [self label:@"LabPlane Mesh" frame:NSMakeRect(82, 342, 340, 33) size:24 bold:YES];
    [self label:@"异地组网客户端 · 本机状态与设备管理" frame:NSMakeRect(82, 322, 420, 22) size:13 bold:NO];
    NSPopUpButton *actions = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(467, 344, 100, 30) pullsDown:YES];
    [actions addItemWithTitle:@"操作"];
    for (NSString *title in @[@"扫描配置", @"导入配置…", @"安装并连接", @"启动服务", @"连接", @"断开", @"打开平台", @"退出应用"]) { [actions addItemWithTitle:title]; }
    actions.target = self;
    actions.action = @selector(menuAction:);
    [self.window.contentView addSubview:actions];
    self.statusLabel = [self label:@"正在扫描本机状态…" frame:NSMakeRect(24, 278, 540, 29) size:17 bold:YES];
    self.detailsLabel = [self label:@"" frame:NSMakeRect(24, 197, 540, 78) size:13 bold:NO];
    self.detailsLabel.maximumNumberOfLines = 4;
    self.configLabel = [self label:@"正在查找连接配置…" frame:NSMakeRect(24, 156, 540, 26) size:12 bold:NO];
    [self button:@"导入配置…" frame:NSMakeRect(20, 107, 120, 34) action:@selector(chooseConfig:)];
    self.installButton = [self button:@"安装并连接" frame:NSMakeRect(147, 107, 130, 34) action:@selector(install:)];
    self.startButton = [self button:@"启动服务" frame:NSMakeRect(284, 107, 110, 34) action:@selector(start:)];
    [self button:@"打开平台" frame:NSMakeRect(401, 107, 110, 34) action:@selector(openPlatform:)];
    self.connectButton = [self button:@"连接" frame:NSMakeRect(20, 63, 94, 34) action:@selector(connect:)];
    self.installButton.enabled = NO;
    self.startButton.enabled = NO;
    self.connectButton.enabled = NO;
    [self button:@"断开" frame:NSMakeRect(121, 63, 94, 34) action:@selector(disconnect:)];
    [self button:@"刷新" frame:NSMakeRect(222, 63, 94, 34) action:@selector(refresh:)];
    [self button:@"退出" frame:NSMakeRect(323, 63, 94, 34) action:@selector(quit:)];
    self.messageLabel = [self label:@"从 LabPlane 平台下载设备连接配置，然后在此导入。"
        frame:NSMakeRect(24, 19, 540, 26) size:11 bold:NO];
    NSMenu *bar = [NSMenu new];
    NSMenuItem *root = [[NSMenuItem alloc] initWithTitle:@"LabPlane Mesh" action:nil keyEquivalent:@""];
    [bar addItem:root];
    NSMenu *menu = [[NSMenu alloc] initWithTitle:@"LabPlane Mesh"];
    [self addMenuItem:menu title:@"导入连接配置…" action:@selector(chooseConfig:)];
    [self addMenuItem:menu title:@"扫描本机状态" action:@selector(refresh:)];
    [self addMenuItem:menu title:@"安装并连接" action:@selector(install:)];
    [self addMenuItem:menu title:@"启动服务" action:@selector(start:)];
    [self addMenuItem:menu title:@"连接" action:@selector(connect:)];
    [self addMenuItem:menu title:@"断开" action:@selector(disconnect:)];
    [self addMenuItem:menu title:@"打开平台" action:@selector(openPlatform:)];
    [menu addItem:[NSMenuItem separatorItem]];
    [self addMenuItem:menu title:@"退出 LabPlane Mesh" action:@selector(quit:)];
    root.submenu = menu;
    NSApp.mainMenu = bar;
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
    [self refresh:nil];
    [NSTimer scheduledTimerWithTimeInterval:15 target:self selector:@selector(refresh:) userInfo:nil repeats:YES];
}

- (void)menuAction:(NSPopUpButton *)sender {
    switch (sender.indexOfSelectedItem) {
        case 1: [self refresh:nil]; break;
        case 2: [self chooseConfig:nil]; break;
        case 3: [self install:nil]; break;
        case 4: [self start:nil]; break;
        case 5: [self connect:nil]; break;
        case 6: [self disconnect:nil]; break;
        case 7: [self openPlatform:nil]; break;
        case 8: [self quit:nil]; break;
        default: break;
    }
}

- (void)quit:(id)sender { [NSApp terminate:nil]; }

- (void)openPlatform:(id)sender {
    if (self.platformURL) { [[NSWorkspace sharedWorkspace] openURL:self.platformURL]; }
    else { self.messageLabel.stringValue = @"安装或导入配置后才能打开平台。"; }
}

- (void)start:(id)sender {
    if (!self.installed) { self.messageLabel.stringValue = @"尚未安装 LabPlane 客户端。"; return; }
    [self runAction:@"启动服务" arguments:@[@"start"] path:@"/Library/Application Support/LabPlaneMesh/labplane-mesh-client"];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender { return YES; }

- (void)chooseConfig:(id)sender {
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.allowedContentTypes = @[UTTypeJSON];
    panel.allowsMultipleSelection = NO;
    panel.prompt = @"导入连接配置";
    if ([panel runModal] != NSModalResponseOK || !panel.URL) { return; }
    NSDictionary *result = Run([self agentPath], @[@"validate", panel.URL.path]);
    if ([result[@"code"] intValue] != 0) {
        self.messageLabel.stringValue = @"连接配置无效，请从平台重新生成。";
        return;
    }
    self.configURL = panel.URL;
    NSDictionary *config = [NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfURL:panel.URL] options:0 error:nil];
    NSString *platform = [config[@"platform"] isKindOfClass:NSString.class] ? config[@"platform"] : nil;
    self.platformURL = [NSURL URLWithString:platform ?: @""];
    self.configLabel.stringValue = [@"已导入：" stringByAppendingString:panel.URL.lastPathComponent];
    self.messageLabel.stringValue = @"点击“安装并连接”，系统将请求管理员授权。";
}

- (void)install:(id)sender {
    if (self.busy) { return; }
    if (self.complete) { self.messageLabel.stringValue = @"安装已完成，可直接连接或启动服务。"; return; }
    if (!self.installed && !self.configURL) {
        self.messageLabel.stringValue = @"请先导入设备连接配置。";
        return;
    }
    NSURL *selected = self.configURL;
    BOOL repairing = self.installed;
    self.busy = YES;
    self.messageLabel.stringValue = @"正在准备安装，稍后会弹出管理员授权…";
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        NSFileManager *fm = [NSFileManager defaultManager];
        NSString *dir = [NSTemporaryDirectory() stringByAppendingPathComponent:[@"LabPlaneMesh-" stringByAppendingString:NSUUID.UUID.UUIDString]];
        NSError *error = nil;
        [fm createDirectoryAtPath:dir withIntermediateDirectories:YES attributes:@{NSFilePosixPermissions: @(0700)} error:&error];
        NSString *agent = [dir stringByAppendingPathComponent:@"labplane-mesh-client"];
        NSString *pkg = [dir stringByAppendingPathComponent:@"tailscale.pkg"];
        NSString *config = [dir stringByAppendingPathComponent:@"config.json"];
        if (!error && ![fm copyItemAtPath:[self agentPath] toPath:agent error:&error]) {}
        if (!error && ![fm copyItemAtPath:[self installerPath] toPath:pkg error:&error]) {}
        if (!error && !repairing && ![fm copyItemAtPath:selected.path toPath:config error:&error]) {}
        if (!error && !repairing) { [fm setAttributes:@{NSFilePosixPermissions: @(0600)} ofItemAtPath:config error:&error]; }
        if (!error) { [fm setAttributes:@{NSFilePosixPermissions: @(0755)} ofItemAtPath:agent error:&error]; }
        NSDictionary *result = nil;
        if (!error) {
            NSString *command = [NSString stringWithFormat:@"env SUDO_USER=%@ %@ install", ShellQuote(NSUserName()), ShellQuote(agent)];
            NSString *script = [NSString stringWithFormat:@"do shell script \"%@\" with administrator privileges", AppleScriptQuote(command)];
            result = Run(@"/usr/bin/osascript", @[@"-e", script]);
        }
        [fm removeItemAtPath:dir error:nil];
        NSString *message = error ? [@"安装文件准备失败：" stringByAppendingString:error.localizedDescription] :
            ([result[@"code"] intValue] == 0 ? @"安装完成，正在刷新状态。" : @"安装未完成，请确认管理员授权和 VPN 权限。");
        dispatch_async(dispatch_get_main_queue(), ^{
            self.busy = NO;
            self.messageLabel.stringValue = message;
            [self refresh:nil];
        });
    });
}

- (void)runAction:(NSString *)name arguments:(NSArray<NSString *> *)arguments path:(NSString *)path {
    if (self.busy) { return; }
    self.busy = YES;
    self.messageLabel.stringValue = [@"正在执行" stringByAppendingFormat:@"%@…", name];
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        NSDictionary *result = Run(path, arguments);
        dispatch_async(dispatch_get_main_queue(), ^{
            self.busy = NO;
            self.messageLabel.stringValue = [result[@"code"] intValue] == 0 ? [name stringByAppendingString:@"命令已执行。"] : [name stringByAppendingString:@"失败，请检查 Tailscale 状态。"];
            [self refresh:nil];
        });
    });
}

- (void)connect:(id)sender {
    if (!self.installed) { self.messageLabel.stringValue = @"尚未安装 LabPlane 客户端。"; return; }
    NSString *path = @"/Library/Application Support/LabPlaneMesh/labplane-mesh-client";
    [self runAction:@"连接" arguments:@[@"connect"] path:path];
}

- (void)disconnect:(id)sender {
    if (!self.installed) { self.messageLabel.stringValue = @"尚未安装 LabPlane 客户端。"; return; }
    [self runAction:@"断开" arguments:@[@"disconnect"] path:[self agentPath]];
}

- (void)refresh:(id)sender {
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
        NSDictionary *result = Run([self agentPath], @[@"inspect"]);
        NSData *data = [result[@"output"] dataUsingEncoding:NSUTF8StringEncoding];
        NSDictionary *inspection = [result[@"code"] intValue] == 0 ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
        NSDictionary *status = [inspection[@"status"] isKindOfClass:NSDictionary.class] ? inspection[@"status"] : @{};
        BOOL installed = [inspection[@"installed"] boolValue];
        BOOL complete = [inspection[@"complete"] boolValue];
        BOOL transport = [inspection[@"transportInstalled"] boolValue];
        BOOL service = [inspection[@"serviceRunning"] boolValue];
        NSArray *candidates = [inspection[@"candidates"] isKindOfClass:NSArray.class] ? inspection[@"candidates"] : @[];
        NSString *hostname = [status[@"hostname"] isKindOfClass:NSString.class] ? status[@"hostname"] : @"本机";
        NSString *state = [status[@"backendState"] isKindOfClass:NSString.class] ? status[@"backendState"] : @"未知";
        NSString *headline = [status[@"online"] boolValue] ? [@"已连接 · " stringByAppendingString:hostname] : [@"未连接 · " stringByAppendingString:state];
        NSArray *ips = [status[@"tailscaleIps"] isKindOfClass:NSArray.class] ? status[@"tailscaleIps"] : @[];
        NSString *detail = [NSString stringWithFormat:@"客户端：%@ · 上报服务：%@ · Tailscale：%@\nTail IP：%@ · 节点 ID：%@\nTailscale 版本：%@",
            installed ? @"已安装" : @"未安装", service ? @"运行中" : @"未运行", transport ? @"已安装" : @"未安装",
            ips.count ? [ips componentsJoinedByString:@", "] : @"—", status[@"nodeId"] ?: @"—", status[@"clientVersion"] ?: @"—"];
        dispatch_async(dispatch_get_main_queue(), ^{
            self.installed = installed;
            self.complete = complete;
            self.installButton.enabled = !complete;
            self.installButton.title = installed && !complete ? @"继续安装" : @"安装并连接";
            self.connectButton.enabled = installed;
            self.startButton.enabled = installed;
            if (installed) {
                NSString *url = [inspection[@"platform"] isKindOfClass:NSString.class] ? inspection[@"platform"] : @"";
                self.platformURL = [NSURL URLWithString:url];
                NSString *prefix = complete ? @"已安装节点：" : @"检测到未完成的安装：";
                self.configLabel.stringValue = [prefix stringByAppendingString:inspection[@"hostname"] ?: @"本机"];
            } else if (!self.configURL && candidates.count > 0) {
                NSDictionary *candidate = candidates.firstObject;
                NSString *path = candidate[@"path"];
                self.configURL = [NSURL fileURLWithPath:path];
                self.platformURL = [NSURL URLWithString:candidate[@"platform"] ?: @""];
                self.configLabel.stringValue = [@"已自动发现：" stringByAppendingString:[path lastPathComponent]];
            } else if (!self.configURL) {
                self.configLabel.stringValue = @"未发现连接配置，可点击“导入配置”手动选择。";
            }
            self.statusLabel.stringValue = headline;
            self.detailsLabel.stringValue = detail;
        });
    });
}

@end

int main(void) {
    @autoreleasepool {
        NSApplication *application = [NSApplication sharedApplication];
        application.activationPolicy = NSApplicationActivationPolicyRegular;
        MeshAppDelegate *delegate = [MeshAppDelegate new];
        application.delegate = delegate;
        [application run];
    }
    return 0;
}
