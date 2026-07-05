// Package archive owns the on-disk Archive: Markdown Topic files as the
// source of truth, a machine-owned cleans/ log for Receipts and undo, and
// the tabignore file. Format rule: an Entry is one line; lines that don't
// parse as Entries are human content and are preserved untouched.
package archive

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

const (
	TopicsDir = "topics"
	CleansDir = "cleans"
	InboxName = "inbox"
	DateFmt   = "2006-01-02"
)

// Entry is one captured tab recorded in a Topic.
type Entry struct {
	Title    string `json:"title"`
	URL      string `json:"url"`
	Note     string `json:"note"`
	Captured string `json:"captured"`
	Opened   string `json:"opened,omitempty"`
	Stale    bool   `json:"stale"`
}

// Topic is one Markdown file with its parsed Entries. Lines holds the raw
// file lines; Entries maps line index -> parsed Entry for entry lines.
type Topic struct {
	Name    string
	Lines   []string
	Entries map[int]Entry
}

var entryRe = regexp.MustCompile(
	`^- \[(.+?)\]\((\S+?)\)(?: - (.*?))? \(captured (\d{4}-\d{2}-\d{2})(?:, opened (\d{4}-\d{2}-\d{2}))?\)\s*$`)

func parseEntry(line string) (Entry, bool) {
	m := entryRe.FindStringSubmatch(line)
	if m == nil {
		return Entry{}, false
	}
	return Entry{Title: m[1], URL: m[2], Note: m[3], Captured: m[4], Opened: m[5]}, true
}

// FormatEntry renders an Entry as its canonical single line.
func FormatEntry(e Entry) string {
	title := strings.NewReplacer("[", "(", "]", ")", "\n", " ").Replace(e.Title)
	if strings.TrimSpace(title) == "" {
		title = e.URL
	}
	url := strings.NewReplacer("(", "%28", ")", "%29", " ", "%20").Replace(e.URL)
	dates := "captured " + e.Captured
	if e.Opened != "" {
		dates += ", opened " + e.Opened
	}
	if e.Note != "" {
		return fmt.Sprintf("- [%s](%s) - %s (%s)", title, url, e.Note, dates)
	}
	return fmt.Sprintf("- [%s](%s) (%s)", title, url, dates)
}

// NormalizeURL applies the same escaping used when writing Entries, so
// lookups match regardless of which form the caller holds.
func NormalizeURL(u string) string {
	return strings.NewReplacer("(", "%28", ")", "%29", " ", "%20").Replace(u)
}

// Init creates the Archive skeleton if missing.
func Init(dir string) error {
	for _, d := range []string{dir, filepath.Join(dir, TopicsDir), filepath.Join(dir, CleansDir)} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			return err
		}
	}
	ignorePath := filepath.Join(dir, "tabignore")
	if _, err := os.Stat(ignorePath); os.IsNotExist(err) {
		content := strings.Join([]string{
			"# tab-wiki ignore file: tabs on these domains are Excluded.",
			"# Excluded means invisible: never read, never archived, left open by Clean.",
			"# One pattern per line.",
			"#   example.com   matches example.com and all subdomains",
			"#   capitalone    (no dot) matches any hostname containing the word",
			"#",
			"# mail.google.com",
			"# online-banking.example.com",
			"",
		}, "\n")
		if err := os.WriteFile(ignorePath, []byte(content), 0o644); err != nil {
			return err
		}
	}
	inboxPath := filepath.Join(dir, TopicsDir, InboxName+".md")
	if _, err := os.Stat(inboxPath); os.IsNotExist(err) {
		content := "# inbox\n\nEntries waiting to be filed: Engine failures and tabs the Engine could not classify.\nRun Refile to distribute them into real Topics.\n"
		if err := os.WriteFile(inboxPath, []byte(content), 0o644); err != nil {
			return err
		}
	}
	gitignore := filepath.Join(dir, ".gitignore")
	if _, err := os.Stat(gitignore); os.IsNotExist(err) {
		if err := os.WriteFile(gitignore, []byte(".lock\n"), 0o644); err != nil {
			return err
		}
	}
	return nil
}

// IgnoreDomains returns the non-comment patterns from tabignore.
func IgnoreDomains(dir string) []string {
	data, err := os.ReadFile(filepath.Join(dir, "tabignore"))
	if err != nil {
		return nil
	}
	var domains []string
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line != "" && !strings.HasPrefix(line, "#") {
			domains = append(domains, line)
		}
	}
	return domains
}

func topicPath(dir, name string) string {
	return filepath.Join(dir, TopicsDir, name+".md")
}

// LoadTopics parses every Topic file, sorted by name.
func LoadTopics(dir string) ([]Topic, error) {
	files, err := filepath.Glob(filepath.Join(dir, TopicsDir, "*.md"))
	if err != nil {
		return nil, err
	}
	sort.Strings(files)
	var topics []Topic
	for _, f := range files {
		name := strings.TrimSuffix(filepath.Base(f), ".md")
		t, err := loadTopic(dir, name)
		if err != nil {
			return nil, err
		}
		topics = append(topics, t)
	}
	return topics, nil
}

func loadTopic(dir, name string) (Topic, error) {
	data, err := os.ReadFile(topicPath(dir, name))
	if err != nil {
		return Topic{}, err
	}
	lines := strings.Split(strings.TrimRight(string(data), "\n"), "\n")
	t := Topic{Name: name, Lines: lines, Entries: map[int]Entry{}}
	for i, line := range lines {
		if e, ok := parseEntry(line); ok {
			t.Entries[i] = e
		}
	}
	return t, nil
}

func saveTopic(dir string, t Topic) error {
	content := strings.Join(t.Lines, "\n") + "\n"
	return os.WriteFile(topicPath(dir, t.Name), []byte(content), 0o644)
}

// appendEntry adds a line to a Topic, creating the file with a heading if new.
func appendEntry(dir, topicName, line string) error {
	p := topicPath(dir, topicName)
	if _, err := os.Stat(p); os.IsNotExist(err) {
		content := "# " + topicName + "\n\n" + line + "\n"
		return os.WriteFile(p, []byte(content), 0o644)
	}
	f, err := os.OpenFile(p, os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = f.WriteString(line + "\n")
	return err
}

// removeLine deletes the first exact occurrence of line in the Topic.
// Returns false if the line was not found (e.g. hand-edited since).
func removeLine(dir, topicName, line string) (bool, error) {
	t, err := loadTopic(dir, topicName)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	for i, l := range t.Lines {
		if l == line {
			t.Lines = append(t.Lines[:i], t.Lines[i+1:]...)
			return true, saveTopic(dir, t)
		}
	}
	return false, nil
}

// replaceLine swaps oldLine for newLine in the Topic. Returns false if not found.
func replaceLine(dir, topicName, oldLine, newLine string) (bool, error) {
	t, err := loadTopic(dir, topicName)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	for i, l := range t.Lines {
		if l == oldLine {
			t.Lines[i] = newLine
			return true, saveTopic(dir, t)
		}
	}
	return false, nil
}

// urlIndex maps normalized URL -> (topic, raw line) across all topics.
type urlLocation struct {
	Topic string
	Line  string
	Entry Entry
}

func buildURLIndex(topics []Topic) map[string]urlLocation {
	idx := map[string]urlLocation{}
	for _, t := range topics {
		for i, e := range t.Entries {
			idx[NormalizeURL(e.URL)] = urlLocation{Topic: t.Name, Line: t.Lines[i], Entry: e}
		}
	}
	return idx
}

// Today is overridable in tests.
var Today = func() string { return time.Now().Format(DateFmt) }

func isStale(e Entry, staleDays int) bool {
	last := e.Captured
	if e.Opened > last {
		last = e.Opened
	}
	t, err := time.Parse(DateFmt, last)
	if err != nil {
		return false
	}
	return time.Since(t) > time.Duration(staleDays)*24*time.Hour
}
