'use strict';

// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = 'development';
process.env.NODE_ENV = 'development';

// Makes the script crash on unhandled rejections instead of silently
// ignoring them. In the future, promise rejections that are not handled will
// terminate the Node.js process with a non-zero exit code.
process.on('unhandledRejection', err => {
  throw err;
});

// Ensure environment variables are read.
require('../config/env');

const { spawn } = require('child_process');
const chalk = require('chalk');
const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const clearConsole = require('react-dev-utils/clearConsole');
const checkRequiredFiles = require('react-dev-utils/checkRequiredFiles');
const {
  choosePort,
  createCompiler,
  prepareProxy,
  prepareUrls,
} = require('react-dev-utils/WebpackDevServerUtils');
const openBrowser = require('react-dev-utils/openBrowser');
const paths = require('../config/paths');
const config = require('../config/webpack.config.dev');
const createDevServerConfig = require('../config/webpackDevServer.config');

const isInteractive = process.stdout.isTTY;

// Tools like Cloud9 rely on this.
const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const IS_WIN = /^win/.test(process.platform);

/**
 * Flag to check whether Electron is
 * running already.
 */
let isElectronRunning = false;

/**
 * Singleton-ish run of Electron
 * Prevents multiple re-runs of Electron App
 */
function runElectronApp(port) {
  if (isElectronRunning) return;

  isElectronRunning = true;
  process.env['ELECTRON_START_URL'] =
    process.env['ELECTRON_START_URL'] || `http://localhost:${port}`;
  const electronCommand = IS_WIN ? 'electron.cmd' : 'electron';

  const electronProcess = spawn(electronCommand, ['.']);

  electronProcess.stdout.on('data', data => {
    // dont log blank output or empty newlines
    const output = data.toString().trim();
    if (output.length) console.info(chalk.green('[ELECTRON]'), output);
  });
  electronProcess.stderr.on('data', data => {
    const output = data.toString();
    console.error(chalk.red(`[ELECTRON] ${output}`));
  });

  // close webpack server when electron quits
  electronProcess.on('exit', code => process.exit(code));

  // clear console for brevity
  process.stdout.write('\x1bc');
}

// Warn and crash if required files are missing
if (!checkRequiredFiles([paths.appHtml, paths.appIndexJs])) {
  process.exit(1);
}

if (process.env.HOST) {
  console.info(
    chalk.cyan(
      `Attempting to bind to HOST environment variable: ${chalk.yellow(
        chalk.bold(process.env.HOST)
      )}`
    )
  );
  console.info(
    `If this was unintentional, check that you haven't mistakenly set it in your shell.`
  );
  console.info(
    `Learn more here: ${chalk.yellow('http://bit.ly/CRA-advanced-config')}`
  );
  console.info();
}

// We require that you explictly set browsers and do not fall back to
// browserslist defaults.
const { checkBrowsers } = require('react-dev-utils/browsersHelper');
checkBrowsers(paths.appPath)
  .then(() => {
    // We attempt to use the default port but if it is busy, we offer the user to
    // run on a different port. `choosePort()` Promise resolves to the next free port.
    return choosePort(HOST, DEFAULT_PORT);
  })
  .then(port => {
    if (port == null) {
      // We have not found a port.
      return;
    }
    const protocol = process.env.HTTPS === 'true' ? 'https' : 'http';
    const appName = require(paths.appPackageJson).name;
    const urls = prepareUrls(protocol, HOST, port);
    // Create a webpack compiler that is configured with custom messages.
    const compiler = createCompiler(
      webpack,
      config,
      appName,
      urls,
      paths.useYarn
    );
    // Load proxy config
    const proxySetting = require(paths.appPackageJson).proxy;
    const proxyConfig = prepareProxy(proxySetting, paths.appPublic);
    // Serve webpack assets generated by the compiler over a web server.
    const serverConfig = createDevServerConfig(
      proxyConfig,
      urls.lanUrlForConfig
    );
    const devServer = new WebpackDevServer(compiler, serverConfig);
    // Launch WebpackDevServer.
    devServer.listen(port, HOST, err => {
      if (err) {
        return console.info(err);
      }
      if (isInteractive) {
        clearConsole();
      }
      console.info(chalk.cyan('Starting the development server...\n'));
      openBrowser(urls.localUrlForBrowser);
    });

    ['SIGINT', 'SIGTERM'].forEach(function(sig) {
      process.on(sig, function() {
        devServer.close();
        process.exit();
      });
    });

    /**
     * Hook runElectronApp() to 'done' (compile) event
     *
     * Fails on error
     */
    compiler.plugin(
      'done',
      stats => !stats.hasErrors() && runElectronApp(port)
    );
  })
  .catch(err => {
    if (err && err.message) {
      console.info(err.message);
    }
    process.exit(1);
  });
