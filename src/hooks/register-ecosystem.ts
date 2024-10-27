import type { Hook } from '@oclif/core';
import DockerEcosystemSupport from '../docker/index.js';

const hook: Hook<'register-ecosystem'> = async function () {
  return new DockerEcosystemSupport();
};

export default hook;
