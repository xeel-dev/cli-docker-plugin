# Xeel CLI / Docker Ecosystem Support

<div style="text-align: center;">
  <strong>
    <a href="https://xeel.dev">Xeel</a>
     | 
    <a href="https://docs.xeel.dev">Documentation</a>
  </strong>
</div>

This is a Xeel CLI plugin, which adds support for the `docker` ecosystem.
It allows for project discovery and listing outdated dependencies, which
the CLI can in turn report to Xeel.

This plugin currently only scans for base images (`FROM ...`) in `Dockerfile*`
files.
