package archive

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/kjalba/tab-wiki/companion/internal/config"
	"github.com/kjalba/tab-wiki/companion/internal/engine"
	"github.com/kjalba/tab-wiki/companion/internal/gitutil"
)

// Op records one reversible Archive mutation inside a Clean.
type Op struct {
	Kind    string `json:"kind"` // "added" | "refreshed"
	Topic   string `json:"topic"`
	Line    string `json:"line,omitempty"`    // added: the appended line
	OldLine string `json:"oldLine,omitempty"` // refreshed: prior line
	NewLine string `json:"newLine,omitempty"` // refreshed: replacement line
}

// CleanLog is the machine-owned record of one Clean (cleans/<id>.json).
type CleanLog struct {
	ID       string        `json:"id"`
	Time     string        `json:"time"`
	Tabs     []engine.Tab  `json:"tabs"`
	Ops      []Op          `json:"ops"`
	Excluded ExcludedCount `json:"excluded"`
	Undone   bool          `json:"undone"`
}

type ExcludedCount struct {
	ByFile   int `json:"byFile"`
	ByToggle int `json:"byToggle"`
	Pinned   int `json:"pinned"`
}

// TopicCount is one Receipt row.
type TopicCount struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
	New   bool   `json:"new"`
}

// Receipt summarizes a Clean for the Receipt page.
type Receipt struct {
	CleanID     string        `json:"cleanId"`
	Total       int           `json:"total"`
	Filed       int           `json:"filed"`
	Inboxed     int           `json:"inboxed"`
	Refreshed   int           `json:"refreshed"`
	Excluded    ExcludedCount `json:"excluded"`
	Topics      []TopicCount  `json:"topics"`
	EngineError string        `json:"engineError,omitempty"`
	GitWarning  string        `json:"gitWarning,omitempty"`
}

// Clean files the captured tabs into the Archive. Tabs are only reported
// back as safe to close after every write has succeeded.
func Clean(dir string, cfg config.Config, tabs []engine.Tab, excluded ExcludedCount) (Receipt, error) {
	tabs = dedupeByURL(tabs)
	topics, err := LoadTopics(dir)
	if err != nil {
		return Receipt{}, err
	}
	idx := buildURLIndex(topics)
	today := Today()

	var newTabs []engine.Tab       // URLs not yet in the Archive: Engine files these
	var retitled []engine.Tab      // already archived, title changed: Engine rewrites Note only
	type refresh struct {
		tab engine.Tab
		loc urlLocation
	}
	var refreshes []refresh
	for _, t := range tabs {
		if loc, ok := idx[NormalizeURL(t.URL)]; ok {
			refreshes = append(refreshes, refresh{t, loc})
			if t.Title != loc.Entry.Title {
				retitled = append(retitled, t)
			}
		} else {
			newTabs = append(newTabs, t)
		}
	}

	// One Engine call covers new tabs and retitled refreshes.
	var engineErr error
	noteFor := map[string]string{}
	topicFor := map[string]string{}
	if len(newTabs)+len(retitled) > 0 {
		batch := append(append([]engine.Tab{}, newTabs...), retitled...)
		assignments, err := engine.File(cfg, batch, topicNames(topics), "")
		if err != nil {
			engineErr = err
		} else {
			for _, a := range assignments {
				topicFor[a.URL] = a.Topic
				noteFor[a.URL] = a.Note
			}
		}
	}

	rec := Receipt{Total: len(tabs), Excluded: excluded}
	var ops []Op
	perTopic := map[string]int{}
	existingTopics := map[string]bool{}
	for _, n := range topicNames(topics) {
		existingTopics[n] = true
	}

	// Refresh already-archived URLs in place: curation wins, the Entry never moves.
	for _, r := range refreshes {
		e := r.loc.Entry
		e.Title = r.tab.Title
		e.Captured = today
		if n, ok := noteFor[r.tab.URL]; ok && n != "" {
			e.Note = n
		}
		newLine := FormatEntry(e)
		if newLine != r.loc.Line {
			if ok, err := replaceLine(dir, r.loc.Topic, r.loc.Line, newLine); err != nil {
				return rec, err
			} else if ok {
				ops = append(ops, Op{Kind: "refreshed", Topic: r.loc.Topic, OldLine: r.loc.Line, NewLine: newLine})
			}
		}
		rec.Refreshed++
	}

	// File new URLs; Engine failure or low confidence lands in the Inbox.
	for _, t := range newTabs {
		topic := InboxName
		note := ""
		if engineErr == nil {
			if tp, ok := topicFor[t.URL]; ok {
				topic = tp
				note = noteFor[t.URL]
			}
		}
		line := FormatEntry(Entry{Title: t.Title, URL: t.URL, Note: note, Captured: today})
		if err := appendEntry(dir, topic, line); err != nil {
			return rec, err
		}
		ops = append(ops, Op{Kind: "added", Topic: topic, Line: line})
		perTopic[topic]++
		if topic == InboxName {
			rec.Inboxed++
		} else {
			rec.Filed++
		}
	}

	for name, count := range perTopic {
		rec.Topics = append(rec.Topics, TopicCount{Name: name, Count: count, New: !existingTopics[name]})
	}
	sort.Slice(rec.Topics, func(i, j int) bool { return rec.Topics[i].Count > rec.Topics[j].Count })

	if engineErr != nil {
		rec.EngineError = engineErr.Error()
	}

	log := CleanLog{
		ID:       time.Now().Format("20060102-150405"),
		Time:     time.Now().Format(time.RFC3339),
		Tabs:     tabs,
		Ops:      ops,
		Excluded: excluded,
	}
	if err := writeCleanLog(dir, log); err != nil {
		return rec, err
	}
	rec.CleanID = log.ID

	msg := fmt.Sprintf("Clean %s: %d tabs (%d filed, %d inbox, %d refreshed)",
		log.ID, rec.Total, rec.Filed, rec.Inboxed, rec.Refreshed)
	rec.GitWarning = gitutil.Commit(dir, msg, cfg.AutoPush)
	return rec, nil
}

func dedupeByURL(tabs []engine.Tab) []engine.Tab {
	seen := map[string]bool{}
	var out []engine.Tab
	for _, t := range tabs {
		key := NormalizeURL(t.URL)
		if !seen[key] {
			seen[key] = true
			out = append(out, t)
		}
	}
	return out
}

func topicNames(topics []Topic) []string {
	var names []string
	for _, t := range topics {
		if t.Name != InboxName {
			names = append(names, t.Name)
		}
	}
	return names
}

func cleanLogPath(dir, id string) string {
	return filepath.Join(dir, CleansDir, id+".json")
}

func writeCleanLog(dir string, log CleanLog) error {
	data, err := json.MarshalIndent(log, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(cleanLogPath(dir, log.ID), append(data, '\n'), 0o644)
}

func readCleanLog(dir, id string) (CleanLog, error) {
	data, err := os.ReadFile(cleanLogPath(dir, id))
	if err != nil {
		return CleanLog{}, err
	}
	var log CleanLog
	err = json.Unmarshal(data, &log)
	return log, err
}

// LatestCleanID returns the most recent Clean's id, or "".
func LatestCleanID(dir string) string {
	files, _ := filepath.Glob(filepath.Join(dir, CleansDir, "*.json"))
	if len(files) == 0 {
		return ""
	}
	sort.Strings(files)
	return strings.TrimSuffix(filepath.Base(files[len(files)-1]), ".json")
}

// Undo reverts the given Clean (latest only) and returns the tabs to reopen.
// Lines the user hand-edited since the Clean are skipped, not clobbered.
func Undo(dir string, cfg config.Config, cleanID string) ([]engine.Tab, error) {
	if latest := LatestCleanID(dir); cleanID != latest {
		return nil, fmt.Errorf("only the most recent Clean (%s) can be undone", latest)
	}
	log, err := readCleanLog(dir, cleanID)
	if err != nil {
		return nil, fmt.Errorf("reading clean log: %w", err)
	}
	if log.Undone {
		return nil, fmt.Errorf("clean %s is already undone", cleanID)
	}
	for _, op := range log.Ops {
		switch op.Kind {
		case "added":
			if _, err := removeLine(dir, op.Topic, op.Line); err != nil {
				return nil, err
			}
		case "refreshed":
			if _, err := replaceLine(dir, op.Topic, op.NewLine, op.OldLine); err != nil {
				return nil, err
			}
		}
	}
	log.Undone = true
	if err := writeCleanLog(dir, log); err != nil {
		return nil, err
	}
	gitutil.Commit(dir, "Undo clean "+cleanID, cfg.AutoPush)
	return log.Tabs, nil
}

// AddIgnoreDomain appends a domain to the tabignore file (idempotent).
func AddIgnoreDomain(dir string, cfg config.Config, domain string) error {
	domain = strings.ToLower(strings.TrimSpace(domain))
	if domain == "" {
		return fmt.Errorf("empty domain")
	}
	for _, d := range IgnoreDomains(dir) {
		if d == domain {
			return nil
		}
	}
	f, err := os.OpenFile(filepath.Join(dir, "tabignore"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	if _, err := f.WriteString(domain + "\n"); err != nil {
		return err
	}
	gitutil.Commit(dir, "Ignore domain: "+domain, cfg.AutoPush)
	return nil
}

// ExploreTopic is the Explore page's view of one Topic.
type ExploreTopic struct {
	Name    string  `json:"name"`
	Entries []Entry `json:"entries"`
}

// Explore returns all Topics with Entries, staleness computed.
func Explore(dir string, cfg config.Config) ([]ExploreTopic, error) {
	topics, err := LoadTopics(dir)
	if err != nil {
		return nil, err
	}
	var out []ExploreTopic
	for _, t := range topics {
		et := ExploreTopic{Name: t.Name}
		var lineIdxs []int
		for i := range t.Entries {
			lineIdxs = append(lineIdxs, i)
		}
		sort.Ints(lineIdxs)
		for _, i := range lineIdxs {
			e := t.Entries[i]
			e.Stale = isStale(e, cfg.StaleDays)
			et.Entries = append(et.Entries, e)
		}
		out = append(out, et)
	}
	return out, nil
}

// Opened stamps today's date as an Entry's last-opened.
func Opened(dir string, cfg config.Config, url string) error {
	topics, err := LoadTopics(dir)
	if err != nil {
		return err
	}
	loc, ok := buildURLIndex(topics)[NormalizeURL(url)]
	if !ok {
		return nil
	}
	e := loc.Entry
	e.Opened = Today()
	newLine := FormatEntry(e)
	if newLine == loc.Line {
		return nil
	}
	if _, err := replaceLine(dir, loc.Topic, loc.Line, newLine); err != nil {
		return err
	}
	gitutil.Commit(dir, "Open entry: "+e.Title, cfg.AutoPush)
	return nil
}

// DeleteEntry removes one Entry from a Topic.
func DeleteEntry(dir string, cfg config.Config, topicName, url string) error {
	t, err := loadTopic(dir, topicName)
	if err != nil {
		return err
	}
	for i, e := range t.Entries {
		if NormalizeURL(e.URL) == NormalizeURL(url) {
			line := t.Lines[i]
			if _, err := removeLine(dir, topicName, line); err != nil {
				return err
			}
			gitutil.Commit(dir, "Delete entry: "+e.Title, cfg.AutoPush)
			return nil
		}
	}
	return fmt.Errorf("no entry with that URL in topic %q", topicName)
}

// DeleteTopic removes an entire Topic file. The Inbox cannot be deleted.
func DeleteTopic(dir string, cfg config.Config, topicName string) error {
	if topicName == InboxName {
		return fmt.Errorf("the inbox cannot be deleted")
	}
	if err := os.Remove(topicPath(dir, topicName)); err != nil {
		return err
	}
	gitutil.Commit(dir, "Delete topic: "+topicName, cfg.AutoPush)
	return nil
}

// Refile re-runs the Engine over the Inbox, optionally guided by the user's
// instruction, and moves Entries into the Topics it assigns.
func Refile(dir string, cfg config.Config, instruction string) (moved, remaining int, err error) {
	inbox, err := loadTopic(dir, InboxName)
	if err != nil {
		return 0, 0, err
	}
	if len(inbox.Entries) == 0 {
		return 0, 0, nil
	}

	var batch []engine.Tab
	var lineIdxs []int
	for i := range inbox.Entries {
		lineIdxs = append(lineIdxs, i)
	}
	sort.Ints(lineIdxs)
	for _, i := range lineIdxs {
		e := inbox.Entries[i]
		batch = append(batch, engine.Tab{URL: e.URL, Title: e.Title, Snippet: e.Note})
	}

	topics, err := LoadTopics(dir)
	if err != nil {
		return 0, 0, err
	}
	assignments, err := engine.File(cfg, batch, topicNames(topics), instruction)
	if err != nil {
		return 0, len(inbox.Entries), err
	}

	topicFor := map[string]engine.Assignment{}
	for _, a := range assignments {
		topicFor[NormalizeURL(a.URL)] = a
	}
	for _, i := range lineIdxs {
		e := inbox.Entries[i]
		a, ok := topicFor[NormalizeURL(e.URL)]
		if !ok || a.Topic == InboxName {
			remaining++
			continue
		}
		if a.Note != "" {
			e.Note = a.Note
		}
		if err := appendEntry(dir, a.Topic, FormatEntry(e)); err != nil {
			return moved, remaining, err
		}
		if _, err := removeLine(dir, InboxName, inbox.Lines[i]); err != nil {
			return moved, remaining, err
		}
		moved++
	}
	gitutil.Commit(dir, fmt.Sprintf("Refile: %d entries out of inbox", moved), cfg.AutoPush)
	return moved, remaining, nil
}
