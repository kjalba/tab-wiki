// Package engine invokes a headless agent CLI (the Engine) to file tabs
// into Topics. Engine output is untrusted: the filing JSON is extracted
// from between <tabwiki> markers and schema-checked before use.
package engine

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"regexp"
	"strings"
	"time"

	"github.com/kjalba/tab-wiki/companion/internal/config"
)

// Tab is what the Extension captured for one open tab.
type Tab struct {
	URL     string `json:"url"`
	Title   string `json:"title"`
	Snippet string `json:"snippet,omitempty"`
	// Window/index are recorded for undo; the Engine never sees them.
	WindowID int `json:"windowId"`
	Index    int `json:"index"`
}

// Assignment is the Engine's filing decision for one tab.
type Assignment struct {
	URL   string `json:"url"`
	Topic string `json:"topic"`
	Note  string `json:"note"`
}

// Status reports one engine's availability for the settings dropdown.
type Status struct {
	Name      string   `json:"name"`
	Enabled   bool     `json:"enabled"`
	Available bool     `json:"available"`
	Models    []string `json:"models"`
}

var markerRe = regexp.MustCompile(`(?s)<tabwiki>(.*?)</tabwiki>`)

// Statuses probes every registered engine on PATH and merges dynamic models.
func Statuses(cfg config.Config) []Status {
	out := make([]Status, 0, len(cfg.Engines))
	for _, e := range cfg.Engines {
		s := Status{Name: e.Name, Enabled: e.Enabled, Models: e.Models}
		if _, err := exec.LookPath(config.ExpandBin(e.Bin)); err == nil {
			s.Available = true
			if len(e.ModelsCommand) > 0 {
				s.Models = mergeModels(e.Models, listModels(e.ModelsCommand))
			}
		}
		out = append(out, s)
	}
	return out
}

func mergeModels(static, dynamic []string) []string {
	seen := map[string]bool{}
	var merged []string
	for _, m := range append(append([]string{}, static...), dynamic...) {
		if m != "" && !seen[m] {
			seen[m] = true
			merged = append(merged, m)
		}
	}
	return merged
}

func listModels(argv []string) []string {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, argv[0], argv[1:]...).Output()
	if err != nil {
		return nil
	}
	var models []string
	for _, line := range strings.Split(string(out), "\n") {
		if line = strings.TrimSpace(line); line != "" {
			models = append(models, line)
		}
	}
	return models
}

// File asks the active Engine to assign each tab a Topic and Note.
func File(cfg config.Config, tabs []Tab, existingTopics []string, instruction string) ([]Assignment, error) {
	eng, err := findEngine(cfg, cfg.ActiveEngine)
	if err != nil {
		return nil, err
	}
	prompt := buildPrompt(tabs, existingTopics, instruction)
	raw, err := invoke(cfg, eng, prompt)
	if err != nil {
		return nil, err
	}
	return parseAssignments(raw, tabs)
}

func findEngine(cfg config.Config, name string) (config.EngineConfig, error) {
	for _, e := range cfg.Engines {
		if e.Name == name {
			if !e.Enabled {
				return e, fmt.Errorf("engine %q is disabled", name)
			}
			if _, err := exec.LookPath(config.ExpandBin(e.Bin)); err != nil {
				return e, fmt.Errorf("engine %q: binary %q not found on PATH (%s)", name, e.Bin, err)
			}
			return e, nil
		}
	}
	return config.EngineConfig{}, fmt.Errorf("no engine named %q in config", name)
}

func buildPrompt(tabs []Tab, existingTopics []string, instruction string) string {
	var b strings.Builder
	b.WriteString("You are the filing engine for tab-wiki, a browser tab archive.\n")
	b.WriteString("Assign each tab below to a topic and write a one-line note (max 120 chars) describing what the page is and why someone saved it.\n\n")
	b.WriteString("Rules:\n")
	b.WriteString("- STRONGLY prefer an existing topic. Only propose a new topic when nothing fits; name it in kebab-case.\n")
	b.WriteString("- If you cannot classify a tab with confidence, use the topic \"inbox\".\n")
	b.WriteString("- Notes are plain text: no markdown, no quotes, no newlines.\n")
	if instruction != "" {
		b.WriteString("- User guidance for this run: " + instruction + "\n")
	}
	b.WriteString("\nExisting topics:\n")
	if len(existingTopics) == 0 {
		b.WriteString("(none yet - this is the first run, invent sensible kebab-case topics)\n")
	}
	for _, t := range existingTopics {
		b.WriteString("- " + t + "\n")
	}
	b.WriteString("\nTabs:\n")
	for i, t := range tabs {
		fmt.Fprintf(&b, "%d. url: %s\n   title: %s\n", i+1, t.URL, t.Title)
		if t.Snippet != "" {
			fmt.Fprintf(&b, "   snippet: %s\n", t.Snippet)
		}
	}
	b.WriteString("\nRespond with ONLY a JSON array between <tabwiki> and </tabwiki> markers, one object per tab, ")
	b.WriteString(`each shaped {"url": "...", "topic": "...", "note": "..."}. No other text inside the markers.` + "\n")
	return b.String()
}

func invoke(cfg config.Config, eng config.EngineConfig, prompt string) (string, error) {
	timeout := time.Duration(cfg.EngineTimeoutSeconds) * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	promptAsArg := false
	args := make([]string, 0, len(eng.Args))
	for _, a := range eng.Args {
		a = strings.ReplaceAll(a, "{MODEL}", cfg.ActiveModel)
		if a == "{PROMPT}" {
			a = prompt
			promptAsArg = true
		}
		args = append(args, a)
	}

	cmd := exec.CommandContext(ctx, config.ExpandBin(eng.Bin), args...)
	if !promptAsArg {
		cmd.Stdin = strings.NewReader(prompt)
	}
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if len(msg) > 500 {
			msg = msg[:500]
		}
		return "", fmt.Errorf("engine %q failed: %w (%s)", eng.Name, err, msg)
	}
	return stdout.String(), nil
}

// parseAssignments validates engine output tab-by-tab: valid assignments are
// kept, anything malformed or unknown falls back to the inbox rather than
// failing the whole Clean.
func parseAssignments(raw string, tabs []Tab) ([]Assignment, error) {
	m := markerRe.FindStringSubmatch(raw)
	if m == nil {
		return nil, fmt.Errorf("no <tabwiki> block in engine output")
	}
	var parsed []Assignment
	if err := json.Unmarshal([]byte(strings.TrimSpace(m[1])), &parsed); err != nil {
		return nil, fmt.Errorf("engine output is not valid JSON: %w", err)
	}

	byURL := map[string]Assignment{}
	for _, a := range parsed {
		if a.URL == "" || a.Topic == "" {
			continue
		}
		a.Topic = sanitizeTopic(a.Topic)
		a.Note = sanitizeNote(a.Note)
		byURL[a.URL] = a
	}

	out := make([]Assignment, 0, len(tabs))
	for _, t := range tabs {
		if a, ok := byURL[t.URL]; ok && a.Topic != "" {
			out = append(out, a)
		} else {
			out = append(out, Assignment{URL: t.URL, Topic: "inbox", Note: ""})
		}
	}
	return out, nil
}

var topicCleanRe = regexp.MustCompile(`[^a-z0-9-]+`)

func sanitizeTopic(t string) string {
	t = strings.ToLower(strings.TrimSpace(t))
	t = strings.ReplaceAll(t, " ", "-")
	t = topicCleanRe.ReplaceAllString(t, "")
	t = strings.Trim(t, "-")
	if t == "" {
		t = "inbox"
	}
	return t
}

func sanitizeNote(n string) string {
	n = strings.Join(strings.Fields(n), " ")
	n = strings.ReplaceAll(n, "(", "[")
	n = strings.ReplaceAll(n, ")", "]")
	if len(n) > 200 {
		n = n[:200]
	}
	return n
}
