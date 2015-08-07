module.exports = function (grunt) {
  'use strict';

  grunt.initConfig({
    babel: {
      options: {
        sourceMap: 'inline'
      },
      dist: {
        files: [{
            expand: true,
            cwd: 'src/',
            src: '**/*.js',
            dest: 'lib/'
        }]
      }
    },
    watch: {
      options: {
        interrupt: true,
        livereload: false
      },
      less: {
        files: 'src/**/*.js',
        tasks: ['build:js']
      }
    }
  });

  grunt.loadNpmTasks('grunt-babel');
  grunt.loadNpmTasks('grunt-contrib-watch');

  grunt.registerTask('default', ['build']);
  grunt.registerTask('build', ['build:js']);
  grunt.registerTask('build:js', ['babel']);
};
