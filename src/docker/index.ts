import type {
  Dependency,
  EcosystemSupport,
  Project,
  RootProject,
} from '@xeel-dev/cli/ecosystem-support';
import { readdir, readFile } from 'node:fs/promises';
import { exec } from '../utils/exec.js';

type DockerProject = Project<'DOCKER'>;
type DockerRootProject = RootProject<'DOCKER'>;
type DockerDependency = Dependency<'DOCKER'>;

const DOCKERFILE_NAMES = ['Dockerfile'];

export default class DockerEcosystemSupport
  implements EcosystemSupport<'DOCKER'>
{
  public readonly name = 'DOCKER';

  /**
   * Scans the current directory for Docker projects.
   * Recursively searches for Dockerfiles, excluding any gitingore'd directories and files.
   */
  public async findProjects(
    directoryPath = process.cwd(),
  ): Promise<DockerRootProject[]> {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const projects: DockerRootProject[] = [];
    for (const entry of entries) {
      if (
        entry.isFile() &&
        DOCKERFILE_NAMES.some((fileName) =>
          `${entry.name}`.startsWith(fileName),
        )
      ) {
        // We infer the project name from the dockerfile suffix, if it exists. Dockerfile.dev -> dev
        let name = entry.name.replace('Dockerfile.', '');
        // If the name is just Dockerfile, we default to the directory name
        if (name === 'Dockerfile') {
          name = directoryPath.split('/').pop()!;
        }

        projects.push({
          name: `${name} Dockerfile`,
          path: `${directoryPath}/${entry.name}`,
          ecosystem: 'DOCKER',
          subProjects: [],
        });
      } else if (entry.isDirectory()) {
        if (entry.name === '.git') {
          continue;
        }
        const { exitCode } = await exec(
          'git',
          ['check-ignore', '-v', entry.name],
          {
            cwd: directoryPath,
          },
        );
        if (exitCode === 0) {
          continue;
        }

        projects.push(
          ...(await this.findProjects(`${directoryPath}/${entry.name}`)),
        );
      }
    }

    return projects;
  }

  private toVersionNumberAndType(version: string) {
    const [versionNumber, ...versionTypeDescription] = version.split('-');
    const versionType = versionTypeDescription.join('-');
    const versionNumberFidelity = versionNumber.split('.').length;
    return { versionNumber, versionNumberFidelity, versionType };
  }

  public async listOutdatedDependencies(
    project: DockerProject,
  ): Promise<DockerDependency[]> {
    // Parse the Dockerfile, look for FROM commands, and extract the image names, and versions
    const dependencies: DockerDependency[] = [];
    // Load the Dockerfile
    const dockerfile = await readFile(project.path, 'utf-8');
    // Parse the Dockerfile
    const lines = dockerfile.split('\n');
    for (const line of lines) {
      // Look for FROM commands
      if (line.startsWith('FROM')) {
        const [_, nameAndVersion] = line.split(' ');
        const [name, version] = nameAndVersion.split(':');
        let [namespace, imageName] = name.split('/');
        if (!imageName) {
          imageName = namespace;
          namespace = 'library';
        }
        if (!version || version === 'latest') {
          // If no version is specified, we assume the latest and ignore it
          continue;
        }
        // Query the Docker API for the current tag version
        const tag = await fetch(
          `https://registry.hub.docker.com/v2/namespaces/${namespace}/repositories/${imageName}/tags/${version}`,
        ).then((response) => response.json());
        const current = {
          date: new Date(tag.last_updated),
          isDeprecated: tag.tag_status !== 'active',
          version,
        };
        // Query the Docker API for the latest tag version, of the same image type
        const { versionNumber, versionNumberFidelity, versionType } =
          this.toVersionNumberAndType(version);
        const tags = await fetch(
          `https://registry.hub.docker.com/v2/namespaces/${namespace}/repositories/${imageName}/tags?page_size=100`,
        ).then((response) => response.json());
        if (!tags.results) {
          continue;
        }
        const excludedTags = ['latest', 'edge', 'stable', 'slim', 'current'];

        // We only want to compare like for like tags, so for example, if the current tag is 1.23,
        // we only want to compare against other minor version tags, like 1.25 or 1.26, not 1.23.1 or 1.23.5
        // This also means we only want to compare against the latest tags of the same type, so if the current tag is 1.23,
        // we only want to compare against tags without a type specifier, like 1.25, not 1.25-slim or 1.25-alpine
        const comparableTags = tags.results
          .filter((tag: any) => {
            const {
              versionNumber: tagVersionNumber,
              versionType: tagVersionType,
              versionNumberFidelity: tagVersionNumberFidelity,
            } = this.toVersionNumberAndType(tag.name);
            return (
              !excludedTags.includes(tag.name) &&
              versionType === tagVersionType &&
              versionNumberFidelity === tagVersionNumberFidelity &&
              // Make sure that both version numbers are numbers or strings, this handles tags like "alpine3.21"
              isNaN(Number(tagVersionNumber.split('.')[0])) ===
                isNaN(Number(versionNumber.split('.')[0]))
            );
          })
          .sort((a: any, b: any) => a.name.localeCompare(b.name));

        if (comparableTags.length === 0) {
          continue;
        }

        const latestTag = comparableTags[comparableTags.length - 1];
        const latest = {
          date: new Date(latestTag.last_updated),
          isDeprecated: latestTag.tag_status !== 'active',
          version: latestTag.name,
        };
        if (latest.version !== current.version && latest.date > current.date) {
          dependencies.push({
            name,
            type: 'PROD',
            ecosystem: 'DOCKER',
            current,
            latest,
          });
        }
      }
    }
    return dependencies;
  }
}
