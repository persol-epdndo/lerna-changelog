import { GitHubUserResponse } from "./github-api";
import { CommitInfo, Release } from "./interfaces";

const UNRELEASED_TAG = "___unreleased___";
const COMMIT_FIX_REGEX = /(fix|close|resolve)(e?s|e?d)? [T#](\d+)/i;

interface CategoryInfo {
  name: string | undefined;
  commits: CommitInfo[];
}

interface Options {
  categories: string[];
  baseIssueUrl: string;
  unreleasedName: string;
}

interface SecurityTestTarget {
  apis: string[];
  urls: string[];
}

export default class MarkdownRenderer {
  private options: Options;

  constructor(options: Options) {
    this.options = options;
  }

  public renderMarkdown(releases: Release[]) {
    let output = releases
      .map(release => this.renderRelease(release))
      .filter(Boolean)
      .join("\n\n\n");
    return output ? `${output}\n\n` : "";
  }

  public renderRelease(release: Release): string | undefined {
    // Group commits in release by category
    const categories = this.groupByCategory(release.commits);
    const categoriesWithCommits = categories.filter(category => category.commits.length > 0);

    // Skip this iteration if there are no commits available for the release
    if (categoriesWithCommits.length === 0) return "";

    const releaseTitle = release.name === UNRELEASED_TAG ? this.options.unreleasedName : release.name;

    let markdown = `## ${releaseTitle} (${release.date})`;

    const securityTestTarget: SecurityTestTarget = { urls: [], apis: [] }
   
    for (const category of categoriesWithCommits) {
      markdown += `\n\n#### ${category.name}\n`;

      const target = this.getSecurityTestTarget(category.commits)
      securityTestTarget.urls.push(...target.urls)
      securityTestTarget.apis.push(...target.apis)

      // TODO: パッケージごとわけて記載するかをconfigから調整できるようにする
      // if (this.hasPackages(category.commits)) {
      //   markdown += this.renderContributionsByPackage(category.commits);
      // } else {
      markdown += this.renderContributionList(category.commits);
      // }
    }

    // TODO: configから調整できるようにする
    // if (release.contributors) {
    //   markdown += `\n\n${this.renderContributorList(release.contributors)}`;
    // }

    if (securityTestTarget.urls.length > 0 || securityTestTarget.apis.length > 0) {
      markdown += `\n\n${this.renderSecurityTestTargetList(securityTestTarget)}`;
    }

    return markdown;
  }

  public renderContributionsByPackage(commits: CommitInfo[]) {
    // Group commits in category by package
    const commitsByPackage: { [id: string]: CommitInfo[] } = {};
    for (const commit of commits) {
      // Array of unique packages.
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

  public renderPackageNames(packageNames: string[]) {
    return packageNames.length > 0 ? packageNames.map(pkg => `\`${pkg}\``).join(", ") : "Other";
  }

  public renderContributionList(commits: CommitInfo[], prefix: string = ""): string {
    return commits
      .map(commit => this.renderContribution(commit))
      .filter(Boolean)
      .map(rendered => `${prefix}* ${rendered}`)
      .join("\n");
  }

  public renderContribution(commit: CommitInfo): string | undefined {
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

  private renderSecurityTestTargetList(securityTestTarget: SecurityTestTarget) {
    let markdown = "#### 脆弱診断対象\n\n"

    if (securityTestTarget.urls.length > 0) {
      const rows = securityTestTarget.urls.filter(onlyUnique).sort().map(x => `* ${x}\n`).join("")
      markdown += `##### URL\n${rows}\n`
    }

    if (securityTestTarget.apis.length > 0) {
      const rows = securityTestTarget.apis.filter(onlyUnique).sort().map(x => `* ${x}\n`).join("")
      markdown += `##### API\n${rows}\n`
    }

    return markdown.trim()
  }

  public renderContributorList(contributors: GitHubUserResponse[]) {
    const renderedContributors = contributors.map(contributor => `- ${this.renderContributor(contributor)}`).sort();

    return `#### Committers: ${contributors.length}\n${renderedContributors.join("\n")}`;
  }

  public renderContributor(contributor: GitHubUserResponse): string {
    const userNameAndLink = `[@${contributor.login}](${contributor.html_url})`;
    if (contributor.name) {
      return `${contributor.name} (${userNameAndLink})`;
    } else {
      return userNameAndLink;
    }
  }

  private hasPackages(commits: CommitInfo[]) {
    return commits.some(commit => commit.packages !== undefined && commit.packages.length > 0);
  }

  private groupByCategory(allCommits: CommitInfo[]): CategoryInfo[] {
    return this.options.categories.map(name => {
      // Keep only the commits that have a matching label with the one
      // provided in the lerna.json config.
      let commits = allCommits.filter(commit => commit.categories && commit.categories.indexOf(name) !== -1);

      return { name, commits };
    });
  }

  private getSecurityTestTarget(commits: CommitInfo[]): SecurityTestTarget {
    const TARGET_HEADER = '種別,診断対象'

    return commits.reduce<SecurityTestTarget>((acc, commit) => {
      const pared = commit.githubIssue?.parsed_body

      // TODO: configから処理を挿入できるようにしたい
      if (pared !== undefined) {
        pared.forEach(x => {
          if (x.type === 'table' && x.header.join() === TARGET_HEADER) {
            x.cells.forEach(c => {
              const name = c[1] ?? ''
              const type = c[0] ?? ''
              if (name.length > 0) {
                if (type === 'URL') {
                  acc.urls.push(name)
                }
                if (['Mutation', 'Query', 'Subscription'].includes(type)) {
                  acc.apis.push(`(${type}) ${name}`)
                }
              }
            })
          }
        })
      }
      return acc
    }, { apis: [], urls: []})
  }

}

function onlyUnique(value: any, index: number, self: any[]): boolean {
  return self.indexOf(value) === index;
}
