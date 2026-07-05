// tab-wiki Companion: a native messaging host. The browser spawns this
// process and speaks length-prefixed JSON over stdio (4-byte little-endian
// length + payload, per the WebExtension native messaging protocol).
//
// Run with -lines for a human-debuggable mode that reads/writes one JSON
// message per line instead (echo '{"cmd":"status"}' | tab-wiki-companion -lines).
package main

import (
	"bufio"
	"encoding/binary"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"

	"github.com/kjalba/tab-wiki/companion/internal/archive"
	"github.com/kjalba/tab-wiki/companion/internal/config"
	"github.com/kjalba/tab-wiki/companion/internal/engine"
	"github.com/kjalba/tab-wiki/companion/internal/gitutil"
	"github.com/kjalba/tab-wiki/companion/internal/lock"
)

type request struct {
	Cmd         string                `json:"cmd"`
	Tabs        []engine.Tab          `json:"tabs,omitempty"`
	Excluded    archive.ExcludedCount `json:"excluded,omitempty"`
	CleanID     string                `json:"cleanId,omitempty"`
	URL         string                `json:"url,omitempty"`
	Topic       string                `json:"topic,omitempty"`
	Instruction string                `json:"instruction,omitempty"`
	Engine      string                `json:"engine,omitempty"`
	Model       string                `json:"model,omitempty"`
	Domain      string                `json:"domain,omitempty"`
}

type response struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`

	// status
	ArchivePath  string          `json:"archivePath,omitempty"`
	Engines      []engine.Status `json:"engines,omitempty"`
	ActiveEngine string          `json:"activeEngine,omitempty"`
	ActiveModel  string          `json:"activeModel,omitempty"`
	LatestClean  string          `json:"latestClean,omitempty"`

	// ignoreList
	Domains []string `json:"domains,omitempty"`

	// clean
	Receipt *archive.Receipt `json:"receipt,omitempty"`

	// undo
	Tabs []engine.Tab `json:"tabs,omitempty"`

	// explore
	Topics []archive.ExploreTopic `json:"topics,omitempty"`

	// refile
	Moved     int `json:"moved,omitempty"`
	Remaining int `json:"remaining,omitempty"`
}

func main() {
	lines := flag.Bool("lines", false, "line-delimited JSON instead of native messaging framing")
	flag.Parse()

	// A browser-spawned host inherits a minimal PATH; recover the real one so
	// engine binaries (claude, codex, ...) are discoverable.
	config.ResolvePATH()

	dir, err := config.ArchiveDir()
	if err != nil {
		fmt.Fprintln(os.Stderr, "tab-wiki-companion:", err)
		os.Exit(1)
	}
	if err := archive.Init(dir); err != nil {
		fmt.Fprintln(os.Stderr, "tab-wiki-companion: init archive:", err)
		os.Exit(1)
	}
	if err := gitutil.EnsureRepo(dir); err != nil {
		fmt.Fprintln(os.Stderr, "tab-wiki-companion: git init:", err)
	}

	in := bufio.NewReader(os.Stdin)
	out := bufio.NewWriter(os.Stdout)
	for {
		var req request
		var readErr error
		if *lines {
			readErr = readLineMessage(in, &req)
		} else {
			readErr = readNativeMessage(in, &req)
		}
		if readErr == io.EOF {
			return
		}
		if readErr != nil {
			fmt.Fprintln(os.Stderr, "tab-wiki-companion: read:", readErr)
			return
		}

		resp := dispatch(dir, req)
		if err := writeMessage(out, resp, *lines); err != nil {
			fmt.Fprintln(os.Stderr, "tab-wiki-companion: write:", err)
			return
		}
	}
}

func dispatch(dir string, req request) response {
	cfg, err := config.Load(dir)
	if err != nil {
		return errResp(err)
	}

	switch req.Cmd {
	case "status":
		return response{
			OK:           true,
			ArchivePath:  dir,
			Engines:      engine.Statuses(cfg),
			ActiveEngine: cfg.ActiveEngine,
			ActiveModel:  cfg.ActiveModel,
			LatestClean:  archive.LatestCleanID(dir),
		}

	case "ignoreList":
		return response{OK: true, Domains: archive.IgnoreDomains(dir)}

	case "addIgnore":
		return withLock(dir, func() response {
			if err := archive.AddIgnoreDomain(dir, cfg, req.Domain); err != nil {
				return errResp(err)
			}
			return response{OK: true, Domains: archive.IgnoreDomains(dir)}
		})

	case "clean":
		return withLock(dir, func() response {
			receipt, err := archive.Clean(dir, cfg, req.Tabs, req.Excluded)
			if err != nil {
				return errResp(err)
			}
			return response{OK: true, Receipt: &receipt}
		})

	case "undo":
		return withLock(dir, func() response {
			tabs, err := archive.Undo(dir, cfg, req.CleanID)
			if err != nil {
				return errResp(err)
			}
			return response{OK: true, Tabs: tabs}
		})

	case "explore":
		topics, err := archive.Explore(dir, cfg)
		if err != nil {
			return errResp(err)
		}
		return response{OK: true, Topics: topics}

	case "opened":
		return withLock(dir, func() response {
			if err := archive.Opened(dir, cfg, req.URL); err != nil {
				return errResp(err)
			}
			return response{OK: true}
		})

	case "deleteEntry":
		return withLock(dir, func() response {
			if err := archive.DeleteEntry(dir, cfg, req.Topic, req.URL); err != nil {
				return errResp(err)
			}
			return response{OK: true}
		})

	case "deleteTopic":
		return withLock(dir, func() response {
			if err := archive.DeleteTopic(dir, cfg, req.Topic); err != nil {
				return errResp(err)
			}
			return response{OK: true}
		})

	case "refile":
		return withLock(dir, func() response {
			moved, remaining, err := archive.Refile(dir, cfg, req.Instruction)
			if err != nil {
				return errResp(err)
			}
			return response{OK: true, Moved: moved, Remaining: remaining}
		})

	case "setEngine":
		return withLock(dir, func() response {
			if req.Engine != "" {
				cfg.ActiveEngine = req.Engine
			}
			if req.Model != "" {
				cfg.ActiveModel = req.Model
			}
			if err := config.Save(dir, cfg); err != nil {
				return errResp(err)
			}
			gitutil.Commit(dir, "Config: engine "+cfg.ActiveEngine+" / "+cfg.ActiveModel, cfg.AutoPush)
			return response{OK: true, ActiveEngine: cfg.ActiveEngine, ActiveModel: cfg.ActiveModel}
		})

	default:
		return errResp(fmt.Errorf("unknown command %q", req.Cmd))
	}
}

func withLock(dir string, fn func() response) response {
	l, err := lock.Acquire(dir)
	if err != nil {
		return errResp(err)
	}
	defer l.Release()
	return fn()
}

func errResp(err error) response {
	return response{OK: false, Error: err.Error()}
}

func readNativeMessage(r *bufio.Reader, v any) error {
	var length uint32
	if err := binary.Read(r, binary.LittleEndian, &length); err != nil {
		return err
	}
	buf := make([]byte, length)
	if _, err := io.ReadFull(r, buf); err != nil {
		return err
	}
	return json.Unmarshal(buf, v)
}

func readLineMessage(r *bufio.Reader, v any) error {
	line, err := r.ReadBytes('\n')
	if len(line) == 0 && err != nil {
		return io.EOF
	}
	return json.Unmarshal(line, v)
}

func writeMessage(w *bufio.Writer, v any, lines bool) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	if lines {
		data = append(data, '\n')
		if _, err := w.Write(data); err != nil {
			return err
		}
		return w.Flush()
	}
	if err := binary.Write(w, binary.LittleEndian, uint32(len(data))); err != nil {
		return err
	}
	if _, err := w.Write(data); err != nil {
		return err
	}
	return w.Flush()
}
