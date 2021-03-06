const path = require('path');
const fs = require('fs');
const watchify = require('watchify');
const browserify = require('browserify');
const es6ify = require('es6ify');
const glob = require('glob');
const gulp = require('gulp');
const changed = require('gulp-changed');
const through2 = require('through2');
const gutil = require('gulp-util');
const source = require('vinyl-source-stream');
import webidlClassGenerator from 'webidl-class-generator';

const TRACEUR_RUNTIME = require.resolve('traceur/bin/traceur-runtime.js');
const DEMO_JS_ENTRY = './demo/entry.js';
const DEMO_STYLES_SOURCE = './src/styles/*.css';
const DEMO_GENERATED_DEST = './demo/generated/';
const DEMO_STYLES_DEST = './demo/styles/';
const DEMO_BUNDLE_FILENAME = 'bundle.js';
const TEST_FILES = './test/*.js';
const TEST_BUNDLE = require('./testem.json').BUNDLE_FILE;
const IDL_SOURCE = './src/idl/*.idl';
const ELEMENTS_DEST = './src/elements/';

gulp.task('generate-from-idl', () =>
  gulp.src(IDL_SOURCE)
    .pipe(changed(ELEMENTS_DEST))
    .pipe(idlToJS())
    .pipe(gulp.dest(ELEMENTS_DEST))
);

gulp.task('demo', ['bundle-demo-js', 'copy-demo-css']);

gulp.task('demo-watch', ['generate-from-idl', 'copy-demo-css', 'watch-demo-js'], () => {
  gulp.watch(IDL_SOURCE, ['generate-from-idl']);
  gulp.watch(DEMO_STYLES_SOURCE, ['copy-demo-css']);
});

gulp.task('bundle-demo-js', () => pipeDemoBundle(bundleJS([DEMO_JS_ENTRY], { watch: false })));
gulp.task('watch-demo-js', () => pipeDemoBundle(bundleJS([DEMO_JS_ENTRY], { watch: true })));

gulp.task('copy-demo-css', () =>
  gulp.src(DEMO_STYLES_SOURCE)
    .pipe(changed(DEMO_STYLES_DEST))
    .pipe(gulp.dest(DEMO_STYLES_DEST))
);

gulp.task('bundle-test-js', () =>
  bundleJS(glob.sync(TEST_FILES), { watch: false })
    .bundle()
    .pipe(fs.createWriteStream(TEST_BUNDLE))
);


function bundleJS(files, { watch }) {
  const browserifyArgs = { debug : true };
  const computedBrowserifyArgs = watch ? Object.assign(browserifyArgs, watchify.args) : browserifyArgs;

  let bundler = browserify([TRACEUR_RUNTIME].concat(files), computedBrowserifyArgs)
    .transform(es6ify.configure(/^(?!.*node_modules)+.+\.js$/));
  // TODO: key on traceur-runner: true instead of not-in-node_modules

  if (watch) {
    bundler = watchify(bundler);
    bundler.on('update', () => pipeDemoBundle(bundler));
  }

  return bundler;
}

function pipeDemoBundle(bundler) {
  gutil.log('Bundling demo...');
  return bundler.bundle()
    .pipe(source(`./${DEMO_BUNDLE_FILENAME}`))
    .pipe(gulp.dest(DEMO_GENERATED_DEST))
    .on('end', () => gutil.log('Bundling demo finished'));
}

function idlToJS() {
  return through2.obj((file, enc, cb) => {
    const basename = path.basename(file.path, '.idl');
    const implModuleName = `./${basename}-impl.js`;

    let generatedJS;
    try {
      generatedJS = webidlClassGenerator(file.contents.toString('utf8'), implModuleName);
    } catch (e) {
      return cb(new gutil.PluginError('webidl class generator', e));
    }

    file.contents = new Buffer(generatedJS);
    file.path = gutil.replaceExtension(file.path, '.js');

    cb(null, file);
  });
}
