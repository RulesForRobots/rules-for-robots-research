<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/RulesForRobots/.github/raw/main/brand/lockups/research-dark.svg">
  <img src="https://github.com/RulesForRobots/.github/raw/main/brand/lockups/research-light.svg" alt="Rules for Robots Research" height="64">
</picture>

# Rules for Robots Research

Finding things out with agents.

Rules for Robots lets one person direct agents through a whole project by approving decisions, never commands. Start at the front door, [RulesForRobots/rules-for-robots](https://github.com/RulesForRobots/rules-for-robots), for the charter, which plugins to install, and the `rfr` marketplace. This repository is where the Research plugins are made; you install them from the marketplace, not from here.

## Scope

Research is for work whose result is a finding rather than a product: a question answered, a decision supported by evidence, a review of what is known, an evaluation of a tool or a method. Its scope and its first plugin are still to come; this repository exists now so that contributors can see where that work will go.

What is likely to belong here, to be confirmed when there is a first plugin:

- Stages for a research question: the question and what would answer it, the sources and how they were found, the finding, and its limits, each approved before the next.
- Checks that a finding cites its sources and that the citations resolve.
- Agents and skills for searching, reading, and summarising sources faithfully.

Research done to build rfr itself (the evidence behind a rule, an eval) stays with the rule it supports, in the repository of that rule's plugin.

## Plugins

None yet.

Open work is in [ROADMAP.md](ROADMAP.md).

## Working on this repository

Node 22 or later; there is nothing to install.

```
npm run verify
```

[AGENTS.md](AGENTS.md) has the layout and conventions, for people and agents alike. Contributing and security reports follow the organization's defaults in [RulesForRobots/.github](https://github.com/RulesForRobots/.github).

## Licence

[MIT](LICENSE).
