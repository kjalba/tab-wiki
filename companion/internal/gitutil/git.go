// Package gitutil auto-commits Archive mutations. Git failures never fail
// the operation that triggered them: the Archive write is the source of
// truth, history is best-effort on top.
package gitutil

import (
	"os/exec"
	"strings"
)

// EnsureRepo initializes a git repo in dir if one is not already present.
func EnsureRepo(dir string) error {
	if run(dir, "rev-parse", "--git-dir") == nil {
		return nil
	}
	if err := run(dir, "init"); err != nil {
		return err
	}
	return nil
}

// Commit stages everything and commits with msg. A no-change commit attempt
// is not an error. Returns a warning string ("" when all is well) so callers
// can surface git trouble on the Receipt without aborting.
func Commit(dir, msg string, autoPush bool) string {
	if err := run(dir, "add", "-A"); err != nil {
		return "git add failed: " + err.Error()
	}
	if err := run(dir, "commit", "-m", msg); err != nil {
		if strings.Contains(err.Error(), "nothing to commit") {
			return ""
		}
		return "git commit failed: " + err.Error()
	}
	if autoPush {
		if err := run(dir, "push"); err != nil {
			return "git push failed (commit is safe locally): " + err.Error()
		}
	}
	return ""
}

func run(dir string, args ...string) error {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return &gitError{args: args, out: string(out), err: err}
	}
	return nil
}

type gitError struct {
	args []string
	out  string
	err  error
}

func (e *gitError) Error() string {
	msg := strings.TrimSpace(e.out)
	if len(msg) > 300 {
		msg = msg[:300]
	}
	return "git " + strings.Join(e.args, " ") + ": " + msg
}
