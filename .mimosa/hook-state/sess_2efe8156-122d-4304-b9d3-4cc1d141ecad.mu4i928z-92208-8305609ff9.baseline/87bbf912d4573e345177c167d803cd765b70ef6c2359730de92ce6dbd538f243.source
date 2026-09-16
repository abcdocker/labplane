package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
)

type harborProjectListItem struct {
	Name string `json:"name"`
}

type harborRepoListItem struct {
	Name string `json:"name"`
}

type harborArtifactTag struct {
	Name string `json:"name"`
}

type harborArtifactListItem struct {
	Digest   string              `json:"digest"`
	Tags     []harborArtifactTag `json:"tags"`
	PushTime string              `json:"push_time"`
}

// HarborIndexCrawl 全量遍历 Harbor 项目/仓库/制品，生成带 tag 的镜像索引条目。
func HarborIndexCrawl(ctx context.Context, cfg Config) ([]HarborImageIndexEntry, error) {
	return HarborIndexCrawlWithProgress(ctx, cfg, nil)
}

func harborIndexCollectProjectNames(ctx context.Context, cfg Config, maxPP int) ([]string, error) {
	var names []string
	for ppage := 1; ppage <= maxPP; ppage++ {
		select {
		case <-ctx.Done():
			return names, ctx.Err()
		default:
		}
		path := fmt.Sprintf("/projects?page=%d&page_size=100", ppage)
		b, code, err := harborDo(ctx, cfg, http.MethodGet, path, nil)
		if err != nil {
			return names, err
		}
		if code != 200 {
			return names, fmt.Errorf("Harbor /projects HTTP %d", code)
		}
		var projects []harborProjectListItem
		if json.Unmarshal(b, &projects) != nil {
			return names, fmt.Errorf("解析 Harbor 项目列表失败")
		}
		if len(projects) == 0 {
			break
		}
		for _, pj := range projects {
			n := strings.TrimSpace(pj.Name)
			if n != "" {
				names = append(names, n)
			}
		}
		if len(projects) < 100 {
			break
		}
	}
	return names, nil
}

// HarborIndexCrawlWithProgress rep 在枚举项目、每完成一个仓库时回调（可写 Redis 进度）；nil 则忽略。
func HarborIndexCrawlWithProgress(ctx context.Context, cfg Config, rep func(HarborImageIndexProgress)) ([]HarborImageIndexEntry, error) {
	if !harborConfiguredFromCfg(cfg) {
		return nil, errHarborNotConfigured
	}
	host := harborRegistryPullHost(cfg.HarborBaseURL)
	if host == "" {
		host = strings.TrimPrefix(strings.TrimPrefix(strings.TrimSpace(cfg.HarborBaseURL), "https://"), "http://")
		host = strings.TrimSuffix(host, "/")
	}

	maxPP := harborIndexMaxProjectPages()
	maxRP := harborIndexMaxRepoPages()
	maxAP := harborIndexMaxArtifactPages()

	names, err := harborIndexCollectProjectNames(ctx, cfg, maxPP)
	if err != nil {
		return nil, err
	}
	if rep != nil {
		rep(HarborImageIndexProgress{
			State:         "running",
			Phase:         "listing_projects",
			Message:       fmt.Sprintf("已枚举 %d 个项目，开始按仓库批量抓取", len(names)),
			ProjectsTotal: len(names),
		})
	}

	var entries []HarborImageIndexEntry
	var mu sync.Mutex
	var reposDone atomic.Int32
	var tagsDone atomic.Int32
	var projectsFinished atomic.Int32
	conc := harborIndexProjectConcurrency()
	sem := make(chan struct{}, conc)
	var wg sync.WaitGroup
	errCh := make(chan error, 1)

	emit := func(proj string, repoRel string) {
		if rep == nil {
			return
		}
		pf := int(projectsFinished.Load())
		pct := 0
		if len(names) > 0 {
			pct = pf * 100 / len(names)
			if pct > 99 {
				pct = 99
			}
		}
		rep(HarborImageIndexProgress{
			State:          "running",
			Phase:          "crawling",
			Message:        "按项目并发抓取仓库与制品标签（批量同步）",
			ProjectsTotal:  len(names),
			ProjectsDone:   pf,
			ReposScanned:   int(reposDone.Load()),
			TagsIndexed:    int(tagsDone.Load()),
			CurrentProject: proj,
			CurrentRepo:    repoRel,
			PercentApprox:  pct,
		})
	}

	for _, project := range names {
		project := project
		if project == "" {
			continue
		}
		select {
		case <-ctx.Done():
			wg.Wait()
			return entries, ctx.Err()
		default:
		}
		wg.Add(1)
		sem <- struct{}{}
		go func(proj string) {
			defer wg.Done()
			defer func() { <-sem }()
			defer func() {
				projectsFinished.Add(1)
				if rep != nil {
					pf := int(projectsFinished.Load())
					pct := 0
					if len(names) > 0 {
						pct = pf * 100 / len(names)
						if pct > 99 {
							pct = 99
						}
					}
					rep(HarborImageIndexProgress{
						State:          "running",
						Phase:          "crawling",
						Message:        fmt.Sprintf("已完成 %d/%d 个项目", pf, len(names)),
						ProjectsTotal:  len(names),
						ProjectsDone:   pf,
						ReposScanned:   int(reposDone.Load()),
						TagsIndexed:    int(tagsDone.Load()),
						CurrentProject: proj,
						PercentApprox:  pct,
					})
				}
			}()
			local, err := harborIndexCrawlRepos(ctx, cfg, host, proj, maxRP, maxAP, func(repoRel string, added int) {
				reposDone.Add(1)
				tagsDone.Add(int32(added))
				emit(proj, repoRel)
			})
			if err != nil {
				select {
				case errCh <- err:
				default:
				}
				return
			}
			mu.Lock()
			entries = append(entries, local...)
			mu.Unlock()
		}(project)
	}
	wg.Wait()
	select {
	case e := <-errCh:
		return entries, e
	default:
	}
	return entries, nil
}

func harborIndexCrawlRepos(ctx context.Context, cfg Config, host, project string, maxRepoPages, maxArtPages int, onRepo func(repoRel string, entriesAdded int)) ([]HarborImageIndexEntry, error) {
	var out []HarborImageIndexEntry
	projEsc := url.PathEscape(project)
	for rpage := 1; rpage <= maxRepoPages; rpage++ {
		select {
		case <-ctx.Done():
			return out, ctx.Err()
		default:
		}
		path := fmt.Sprintf("/projects/%s/repositories?page=%d&page_size=100", projEsc, rpage)
		b, code, err := harborDo(ctx, cfg, http.MethodGet, path, nil)
		if err != nil {
			return out, err
		}
		if code != 200 {
			return out, fmt.Errorf("Harbor /repositories %s HTTP %d", project, code)
		}
		var repos []harborRepoListItem
		if json.Unmarshal(b, &repos) != nil {
			return out, fmt.Errorf("解析仓库列表失败")
		}
		if len(repos) == 0 {
			break
		}
		for _, r := range repos {
			repoFull := strings.TrimSpace(r.Name)
			if repoFull == "" {
				continue
			}
			repoRel := harborNormalizeRepositoryForProject(project, repoFull)
			if repoRel == "" {
				continue
			}
			before := len(out)
			repoEsc := harborArtifactListRepoPathEsc(ctx, cfg, projEsc, repoRel)
			if repoEsc == "" {
				continue
			}
			for apage := 1; apage <= maxArtPages; apage++ {
				select {
				case <-ctx.Done():
					return out, ctx.Err()
				default:
				}
				apath := fmt.Sprintf("/projects/%s/repositories/%s/artifacts?page=%d&page_size=100", projEsc, repoEsc, apage)
				ab, acode, aerr := harborDo(ctx, cfg, http.MethodGet, apath, nil)
				if aerr != nil {
					return out, aerr
				}
				if acode != 200 {
					return out, fmt.Errorf("Harbor artifacts %s/%s HTTP %d", project, repoRel, acode)
				}
				var arts []harborArtifactListItem
				if json.Unmarshal(ab, &arts) != nil {
					return out, fmt.Errorf("解析制品列表失败")
				}
				if len(arts) == 0 {
					break
				}
				for _, a := range arts {
					dig := strings.TrimSpace(a.Digest)
					if len(a.Tags) == 0 {
						ref := harborImageReference(host, project, repoRel, "")
						if dig != "" {
							ref = harborImageReference(host, project, repoRel, dig)
						}
						out = append(out, HarborImageIndexEntry{
							Project:   project,
							Repo:      repoRel,
							Tag:       "",
							Digest:    dig,
							PushTime:  a.PushTime,
							Reference: ref,
						})
						continue
					}
					for _, t := range a.Tags {
						tag := strings.TrimSpace(t.Name)
						ref := harborImageReference(host, project, repoRel, tag)
						out = append(out, HarborImageIndexEntry{
							Project:   project,
							Repo:      repoRel,
							Tag:       tag,
							Digest:    dig,
							PushTime:  a.PushTime,
							Reference: ref,
						})
					}
				}
				if len(arts) < 100 {
					break
				}
			}
			added := len(out) - before
			if onRepo != nil {
				onRepo(repoRel, added)
			}
		}
		if len(repos) < 100 {
			break
		}
	}
	return out, nil
}
