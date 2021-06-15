"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const UNRELEASED_TAG = "___unreleased___";
const COMMIT_FIX_REGEX = /(fix|close|resolve)(e?s|e?d)? [T#](\d+)/i;
class MarkdownRenderer {
    constructor(options) {
        this.options = options;
    }
    renderMarkdown(releases) {
        let output = releases
            .map(release => this.renderRelease(release))
            .filter(Boolean)
            .join("\n\n\n");
        return output ? `\n${output}` : "";
    }
    renderRelease(release) {
        const categories = this.groupByCategory(release.commits);
        const categoriesWithCommits = categories.filter(category => category.commits.length > 0);
        if (categoriesWithCommits.length === 0)
            return "";
        const releaseTitle = release.name === UNRELEASED_TAG ? this.options.unreleasedName : release.name;
        let markdown = `## ${releaseTitle} (${release.date})`;
        const securityTestTarget = { urls: [], apis: [] };
        for (const category of categoriesWithCommits) {
            markdown += `\n\n#### ${category.name}\n`;
            const target = this.getSecurityTestTarget(category.commits);
            securityTestTarget.urls.push(...target.urls);
            securityTestTarget.apis.push(...target.apis);
            markdown += this.renderContributionList(category.commits);
        }
        if (securityTestTarget.urls.length > 0 || securityTestTarget.apis.length > 0) {
            markdown += `\n\n${this.renderSecurityTestTargetList(securityTestTarget)}`;
        }
        return markdown;
    }
    renderContributionsByPackage(commits) {
        const commitsByPackage = {};
        for (const commit of commits) {
            const changedPackages = commit.packages || [];
            const packageName = this.renderPackageNames(changedPackages);
            commitsByPackage[packageName] = commitsByPackage[packageName] || [];
            commitsByPackage[packageName].push(commit);
        }
        const packageNames = Object.keys(commitsByPackage);
        return packageNames
            .map(packageName => {
            const pkgCommits = commitsByPackage[packageName];
            return `* ${packageName}\n${this.renderContributionList(pkgCommits, "  ")}`;
        })
            .join("\n");
    }
    renderPackageNames(packageNames) {
        return packageNames.length > 0 ? packageNames.map(pkg => `\`${pkg}\``).join(", ") : "Other";
    }
    renderContributionList(commits, prefix = "") {
        return commits
            .map(commit => this.renderContribution(commit))
            .filter(Boolean)
            .map(rendered => `${prefix}* ${rendered}`)
            .join("\n");
    }
    renderContribution(commit) {
        const issue = commit.githubIssue;
        if (issue) {
            let markdown = "";
            if (issue.number && issue.pull_request && issue.pull_request.html_url) {
                const prUrl = issue.pull_request.html_url;
                markdown += `[#${issue.number}](${prUrl}) `;
            }
            if (issue.title && issue.title.match(COMMIT_FIX_REGEX)) {
                issue.title = issue.title.replace(COMMIT_FIX_REGEX, `Closes [#$3](${this.options.baseIssueUrl}$3)`);
            }
            markdown += `${issue.title} ([@${issue.user.login}](${issue.user.html_url}))`;
            return markdown;
        }
    }
    renderSecurityTestTargetList(securityTestTarget) {
        let markdown = "#### 脆弱診断対象\n\n";
        if (securityTestTarget.urls.length > 0) {
            const rows = securityTestTarget.urls.filter(onlyUnique).sort().map(x => `* ${x}\n`).join("");
            markdown += `##### URL\n${rows}\n`;
        }
        if (securityTestTarget.apis.length > 0) {
            const rows = securityTestTarget.apis.filter(onlyUnique).sort().map(x => `* ${x}\n`).join("");
            markdown += `##### API\n${rows}\n`;
        }
        return markdown;
    }
    renderContributorList(contributors) {
        const renderedContributors = contributors.map(contributor => `- ${this.renderContributor(contributor)}`).sort();
        return `#### Committers: ${contributors.length}\n${renderedContributors.join("\n")}`;
    }
    renderContributor(contributor) {
        const userNameAndLink = `[@${contributor.login}](${contributor.html_url})`;
        if (contributor.name) {
            return `${contributor.name} (${userNameAndLink})`;
        }
        else {
            return userNameAndLink;
        }
    }
    hasPackages(commits) {
        return commits.some(commit => commit.packages !== undefined && commit.packages.length > 0);
    }
    groupByCategory(allCommits) {
        return this.options.categories.map(name => {
            let commits = allCommits.filter(commit => commit.categories && commit.categories.indexOf(name) !== -1);
            return { name, commits };
        });
    }
    getSecurityTestTarget(commits) {
        const TARGET_HEADER = '種別,診断対象';
        return commits.reduce((acc, commit) => {
            var _a;
            const pared = (_a = commit.githubIssue) === null || _a === void 0 ? void 0 : _a.parsed_body;
            if (pared !== undefined) {
                pared.forEach(x => {
                    if (x.type === 'table' && x.header.join() === TARGET_HEADER) {
                        x.cells.forEach(c => {
                            var _a, _b;
                            const name = (_a = c[1]) !== null && _a !== void 0 ? _a : '';
                            const type = (_b = c[0]) !== null && _b !== void 0 ? _b : '';
                            if (name.length > 0) {
                                if (type === 'URL') {
                                    acc.urls.push(name);
                                }
                                if (['Mutation', 'Query', 'Subscription'].includes(type)) {
                                    acc.apis.push(`(${type}) ${name}`);
                                }
                            }
                        });
                    }
                });
            }
            return acc;
        }, { apis: [], urls: [] });
    }
}
exports.default = MarkdownRenderer;
function onlyUnique(value, index, self) {
    return self.indexOf(value) === index;
}
