'use strict';


// Declare app level module which depends on filters, and services
angular.module('myApp', [
  'ngRoute',
  'myApp.filters',
  'myApp.services',
  'myApp.directives',
  'myApp.controllers'
]).
config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/home', { templateUrl: 'partials/home.html', controller: 'HomeCtrl' });
    $routeProvider.when('/dots', { templateUrl: 'partials/dots.html', controller: 'DotsCtrl' });
    $routeProvider.when('/images', { templateUrl: 'partials/images.html', controller: 'ImagesCtrl' });
    $routeProvider.otherwise({ redirectTo: '/home' });
}]);
