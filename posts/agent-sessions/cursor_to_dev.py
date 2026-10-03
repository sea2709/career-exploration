#!/usr/bin/env python3
"""Convert a Cursor agent transcript into a JSONL file that DEV's Agent Sessions uploader accepts.

DEV (https://dev.to/agent_sessions/new) has no Cursor parser, so this writes the Claude Code
transcript format, which DEV auto-detects. Cursor transcripts don't store tool results, so tool
calls show up on DEV without their output.

Usage:
    python3 cursor_to_dev.py <transcript.jsonl> <out.jsonl> [--turns 1-4,7-8]

--turns picks prompts by number (1-based, counting only the prompts you typed), and each prompt
keeps every agent message that follows it. Run without --turns to list the prompts.
"""

import argparse
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

HOME = str(Path.home())
WORKSPACE = f'{HOME}/Development/Learning/careers-exploration'

# Prompts Cursor injects after a background task finishes; not typed by the user.
SYSTEM_PROMPTS = ('Briefly inform the user about the task result',)

REDACTIONS = [
    (re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'), '[email]'),
    (re.compile(r'\b(sk|ghp|gho|github_pat|xox[abp])[-_][A-Za-z0-9_-]{16,}'), '[token]'),
    (re.compile(r'\bAIza[0-9A-Za-z_-]{30,}'), '[token]'),
    (re.compile(r'(Bearer\s+)[A-Za-z0-9._~+/=-]{20,}'), r'\1[token]'),
    (re.compile(r'\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|KEY))=\S+'), r'\1=[redacted]'),
]


def scrub(text):
    text = text.replace(WORKSPACE, '~/careers-exploration')
    text = re.sub(r'\.cursor/projects/[\w-]+', '.cursor/projects/careers-exploration', text)
    text = text.replace(HOME, '~')
    for pattern, replacement in REDACTIONS:
        text = pattern.sub(replacement, text)
    return text


def parse_timestamp(text):
    m = re.search(r'<timestamp>\w+, (\w+ \d+, \d{4}, \d+:\d+ [AP]M) \(UTC([+-]\d+)\)</timestamp>', text)
    if not m:
        return None
    local = datetime.strptime(m.group(1), '%b %d, %Y, %I:%M %p')
    return local.replace(tzinfo=timezone(timedelta(hours=int(m.group(2))))).isoformat()


def user_prompt(text):
    m = re.search(r'<user_query>(.*?)</user_query>', text, re.S)
    return (m.group(1) if m else text).strip()


TOOL_INPUTS = {
    'Shell': ('Bash', lambda i: {'command': i.get('command', '')}),
    'Read': ('Read', lambda i: {'file_path': i.get('path', '')}),
    'Write': ('Write', lambda i: {'file_path': i.get('path', '')}),
    'StrReplace': ('Edit', lambda i: {'file_path': i.get('path', '')}),
    'Delete': ('Delete', lambda i: {'file_path': i.get('path', '')}),
    'Grep': ('Grep', lambda i: {'pattern': i.get('pattern', ''), 'path': i.get('path', '')}),
    'Glob': ('Glob', lambda i: {'pattern': i.get('glob_pattern', '')}),
}


def convert_tool(block):
    name = block.get('name', 'tool')
    raw_input = block.get('input') or {}
    if name in TOOL_INPUTS:
        name, shape = TOOL_INPUTS[name]
        tool_input = shape(raw_input)
    else:
        # Keep small fields only; long payloads (file contents, prompts) would bloat the upload.
        tool_input = {k: v for k, v in raw_input.items() if len(json.dumps(v)) <= 300}
    return {'type': 'tool_use', 'name': name, 'input': json.loads(scrub(json.dumps(tool_input)))}


def read_turns(path):
    """Group the transcript into turns: one typed prompt plus the agent messages after it."""
    turns, timestamp = [], None
    for line in Path(path).read_text().splitlines():
        record = json.loads(line)
        role = record.get('role')
        if role not in ('user', 'assistant'):
            continue
        blocks = record['message']['content']
        if role == 'user':
            text = '\n'.join(b.get('text', '') for b in blocks if b.get('type') == 'text')
            timestamp = parse_timestamp(text) or timestamp
            prompt = user_prompt(text)
            if prompt.startswith(SYSTEM_PROMPTS):
                continue
            turns.append({'prompt': prompt, 'timestamp': timestamp, 'replies': []})
        elif turns:
            content = []
            for b in blocks:
                if b.get('type') == 'text' and b.get('text', '').strip():
                    content.append({'type': 'text', 'text': scrub(b['text'].strip())})
                elif b.get('type') == 'tool_use':
                    content.append(convert_tool(b))
            if content:
                turns[-1]['replies'].append({'content': content, 'timestamp': timestamp})
    return turns


def parse_selection(spec, count):
    selected = set()
    for part in spec.split(','):
        start, _, end = part.partition('-')
        first = int(start)
        last = int(end) if end else (count if part.endswith('-') else first)
        selected.update(range(first, last + 1))
    return selected


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('transcript')
    parser.add_argument('out', nargs='?')
    parser.add_argument('--turns', help='prompt numbers to keep, e.g. 1-4,7-8 or 3-')
    args = parser.parse_args()

    turns = read_turns(args.transcript)
    if not args.out:
        for n, turn in enumerate(turns, 1):
            print(f'{n:>3}. {turn["prompt"][:120].replace(chr(10), " ")}')
        return

    keep = parse_selection(args.turns, len(turns)) if args.turns else set(range(1, len(turns) + 1))
    session_id = Path(args.transcript).stem
    base = {'sessionId': session_id, 'cwd': '~/careers-exploration', 'version': 'cursor-export'}

    lines = []
    for n, turn in enumerate(turns, 1):
        if n not in keep:
            continue
        lines.append({
            **base,
            'type': 'user',
            'timestamp': turn['timestamp'],
            'message': {'role': 'user', 'content': [{'type': 'text', 'text': scrub(turn['prompt'])}]},
        })
        for reply in turn['replies']:
            lines.append({
                **base,
                'type': 'assistant',
                'timestamp': reply['timestamp'],
                'message': {'role': 'assistant', 'model': 'cursor-agent', 'content': reply['content']},
            })

    Path(args.out).write_text(''.join(json.dumps(line) + '\n' for line in lines))
    prompts = sum(1 for line in lines if line['type'] == 'user')
    print(f'Wrote {args.out}: {prompts} prompts, {len(lines) - prompts} agent messages', file=sys.stderr)


if __name__ == '__main__':
    main()
