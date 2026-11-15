# rules-for-robots-research

Finding things out with agents. Part of Rules for Robots; the charter, the marketplace, and the work across repositories are in [RulesForRobots/rules-for-robots](https://github.com/RulesForRobots/rules-for-robots). Read [ROADMAP.md](ROADMAP.md) for the open work here.

## Commands

- Verify (run before reporting work as done, and include its output): `npm run verify`. It runs the CI script tests, the structure and self-containment check and the tests of every plugin, and `claude plugin validate --strict` on each plugin when Claude Code is on the PATH. Node 22 or later; no install step.
- One plugin: `node .github/scripts/plugins.mjs check <plugin>` and `node .github/scripts/plugins.mjs test <plugin>`.

## Layout

```
rules-for-robots-research/
├── AGENTS.md  CLAUDE.md  README.md  ROADMAP.md
├── .github/
│   ├── CODEOWNERS                 # One line per plugin folder
│   ├── scripts/                   # What CI and `npm run verify` run, and their tests
│   └── workflows/
│       ├── ci.yml                 # Tests only the plugins a change touches
│       └── release.yml            # Tags <plugin>--v<version>, writes the release notes
├── plugins/
│   └── rfr-<name>/                # Self-contained: nothing outside this folder at run time
│       ├── .claude-plugin/plugin.json
│       ├── README.md  CHANGELOG.md
│       ├── rules/                 # Rule files, each with its evidence beside it
│       ├── stages/                # Stage and artifact definitions, for rfr-process
│       ├── agents/  skills/  hooks/  scripts/
│       └── test/
├── evals/                         # Cases for this repository's rules; results summarised in each rule
├── examples/                      # Only what CI or a tutorial runs against
└── docs/
    ├── specs/                     # Current specs, one per component
    └── decisions/                 # ADRs: why things are as they are
```

A folder appears when it has something in it; the layout says where things go when they do.

## Conventions

- **Self-contained plugins.** A plugin reads nothing from another plugin's folder or from the rest of the repository at run time; CI refuses a run-time file that refers outside it. Shared code is owned by Core and bundled into a plugin by a build step, CI checks the bundled copy matches, and nobody edits it by hand.
- **Versions.** Raise `version` in a plugin's `plugin.json` whenever its contents change, or installed copies will not update. Add each change to its `CHANGELOG.md` under `## Unreleased`; a release moves that into the version's heading.
- **Releases are the maintainer's decision.** Actions, Release, Run workflow, with the plugin's folder name; it tags `<plugin>--v<version>`, the form dependency ranges resolve against, and publishes the changelog section as the release notes. Leave "dry run" ticked to check a release without publishing it.
- **A rule's evidence is beside it:** the eval case, its result, or the CI check that enforces it. A rule ships when it has a mechanical check or evidence that it changes agent behaviour.
- **Specs are short and current.** A change to a spec replaces text; the reasoning goes in a decision record in `docs/decisions/`.
- **`ROADMAP.md` lists open work only.** Done work leaves it; the pull request is the record.
- **Carried-over files.** A file brought from the archived repository (`lifelike-and-believable/rules-for-robots`) arrives in a commit whose message names its source path and commit there.
- **CI.** The CI scripts in `.github/scripts/` and the workflows `ci.yml` and `release.yml` are copies of the ones in [rules-for-robots-core](https://github.com/RulesForRobots/rules-for-robots-core) ([ADR 0001 there](https://github.com/RulesForRobots/rules-for-robots-core/blob/main/docs/decisions/0001-repository-ci.md)). Change them in Core first, then copy the change here; do not edit the copy on its own.
- **Ownership.** `.github/CODEOWNERS` has one line per plugin folder; add the line in the pull request that adds the plugin.

## Writing

Canadian English. Plain sentences; no emphatic capitals, few em dashes, no "it's not X, it's Y" constructions.
