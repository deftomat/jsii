import {
  ensureDir,
  mkdtemp,
  remove,
  writeFile,
  readFile,
  readJson,
} from 'fs-extra';
import { tmpdir } from 'os';
import { join } from 'path';

import { Compiler } from '../lib/compiler';
import { ProjectInfo } from '../lib/project-info';

describe(Compiler, () => {
  describe('generated tsconfig', () => {
    test('default is tsconfig.json', async () => {
      const sourceDir = await mkdtemp(
        join(tmpdir(), 'jsii-compiler-watch-mode-'),
      );

      const compiler = new Compiler({
        projectInfo: _makeProjectInfo(sourceDir, 'index.d.ts'),
      });

      await compiler.emit();

      expect(await readJson(join(sourceDir, 'tsconfig.json'), 'utf-8')).toEqual(
        expectedTypeScriptConfig(),
      );
    });

    test('file name can be customized', async () => {
      const sourceDir = await mkdtemp(
        join(tmpdir(), 'jsii-compiler-watch-mode-'),
      );

      const compiler = new Compiler({
        projectInfo: _makeProjectInfo(sourceDir, 'index.d.ts'),
        generateTypeScriptConfig: 'tsconfig.jsii.json',
      });

      await compiler.emit();

      expect(
        await readJson(join(sourceDir, 'tsconfig.jsii.json'), 'utf-8'),
      ).toEqual(expectedTypeScriptConfig());
    });
  });

  test('"watch" mode', async () => {
    // This can be a little slow, allowing 15 seconds maximum here (default is 5 seconds)
    jest.setTimeout(15_000);

    const sourceDir = await mkdtemp(
      join(tmpdir(), 'jsii-compiler-watch-mode-'),
    );

    try {
      await writeFile(join(sourceDir, 'index.ts'), 'export class MarkerA {}');
      // Intentionally using lower case name - it should be case-insensitive
      await writeFile(join(sourceDir, 'readme.md'), '# Test Package');

      const compiler = new Compiler({
        projectInfo: _makeProjectInfo(sourceDir, 'index.d.ts'),
        failOnWarnings: true,
        projectReferences: false,
      });

      let firstCompilation = true;
      let onWatchClosed: () => void;
      let onWatchFailed: (err: Error) => void;
      const watchClosed = new Promise<void>((ok, ko) => {
        onWatchClosed = ok;
        onWatchFailed = ko;
      });
      const watch = await compiler.watch({
        nonBlocking: true,
        // Ignore diagnostics reporting (not to pollute test console output)
        reportDiagnostics: () => null,
        // Ignore watch status reporting (not to pollute test console output)
        reportWatchStatus: () => null,
        // Verify everything goes according to plan
        compilationComplete: async (emitResult) => {
          try {
            expect(emitResult.emitSkipped).toBeFalsy();
            const output = await readFile(join(sourceDir, '.jsii'), {
              encoding: 'utf-8',
            });
            if (firstCompilation) {
              firstCompilation = false;
              expect(output).toContain('"MarkerA"');
              await writeFile(
                join(sourceDir, 'index.ts'),
                'export class MarkerB {}',
              );
              return;
            }
            expect(output).toContain('"MarkerB"');
            watch.close();
            // Tell the test suite we're done here!
            onWatchClosed();
          } catch (e) {
            watch.close();
            onWatchFailed(e);
          }
        },
      });
      await watchClosed;
    } finally {
      await remove(sourceDir);
    }
  });

  test('rootDir is added to assembly', async () => {
    const outDir = 'jsii-outdir';
    const rootDir = 'jsii-rootdir';
    const sourceDir = await mkdtemp(join(tmpdir(), 'jsii-tmpdir'));
    await ensureDir(join(sourceDir, rootDir));

    try {
      await writeFile(
        join(sourceDir, rootDir, 'index.ts'),
        'export class MarkerA {}',
      );
      // Intentionally using lower case name - it should be case-insensitive
      await writeFile(join(sourceDir, rootDir, 'readme.md'), '# Test Package');

      const compiler = new Compiler({
        projectInfo: {
          ..._makeProjectInfo(sourceDir, join(outDir, 'index.d.ts')),
          tsc: {
            outDir,
            rootDir,
          },
        },
        failOnWarnings: true,
        projectReferences: false,
      });

      await compiler.emit();

      const assembly = await readJson(join(sourceDir, '.jsii'), 'utf-8');
      expect(assembly.metadata).toEqual(expect.objectContaining({
        tscRootDir: rootDir,
        }),
      );
    } finally {
      await remove(sourceDir);
    }
  });
});

function _makeProjectInfo(sourceDir: string, types: string): ProjectInfo {
  return {
    projectRoot: sourceDir,
    packageJson: undefined,
    types,
    main: types.replace(/(?:\.d)?\.ts(x?)/, '.js$1'),
    name: 'jsii', // That's what package.json would tell if we look up...
    version: '0.0.1',
    jsiiVersionFormat: 'short',
    license: 'Apache-2.0',
    author: { name: 'John Doe', roles: ['author'] },
    repository: { type: 'git', url: 'https://github.com/aws/jsii.git' },
    dependencies: {},
    peerDependencies: {},
    dependencyClosure: [],
    bundleDependencies: {},
    targets: {},
    excludeTypescript: [],
  };
}

function expectedTypeScriptConfig() {
  return {
    _generated_by_jsii_:
      'Generated by jsii - safe to delete, and ideally should be in .gitignore',
    compilerOptions: {
      alwaysStrict: true,
      charset: 'utf8',
      composite: false,
      declaration: true,
      experimentalDecorators: true,
      incremental: true,
      inlineSourceMap: true,
      inlineSources: true,
      lib: ['es2019'],
      module: 'CommonJS',
      newLine: 'lf',
      noEmitOnError: true,
      noFallthroughCasesInSwitch: true,
      noImplicitAny: true,
      noImplicitReturns: true,
      noImplicitThis: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      resolveJsonModule: true,
      strict: true,
      strictNullChecks: true,
      strictPropertyInitialization: true,
      stripInternal: false,
      target: 'ES2019',
      tsBuildInfoFile: 'tsconfig.tsbuildinfo',
    },
    exclude: ['node_modules'],
    include: [join('**', '*.ts')],
  };
}
