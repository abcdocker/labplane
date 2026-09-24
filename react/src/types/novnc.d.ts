declare module "@novnc/novnc" {
  export type RFBOptions = {
    shared?: boolean;
    credentials?: {
      username?: string;
      password?: string;
      target?: string;
    };
    repeaterID?: string;
    wsProtocols?: string[];
  };

  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, url: string | WebSocket | RTCDataChannel, options?: RFBOptions);

    viewOnly: boolean;
    scaleViewport: boolean;
    resizeSession: boolean;
    showDotCursor: boolean;
    background: string;

    disconnect(): void;
    focus(options?: FocusOptions): void;
    blur(): void;
    sendCtrlAltDel(): void;
    sendCredentials(credentials: RFBOptions["credentials"]): void;
    clipboardPasteFrom(text: string): void;
  }
}
