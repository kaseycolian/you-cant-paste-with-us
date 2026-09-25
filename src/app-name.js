// The app's name lives in one place: the <title> in index.html. This copies it
// into every [data-app-name] above this script. It runs while the page is still
// being read, so the name is there before anything is drawn.
//
// It also shows the "run npm start" note when the page is opened as a file,
// where the browser refuses to load the app's modules.
(function () {
  var name = document.title;
  document.querySelectorAll('[data-app-name]').forEach(function (el) {
    el.textContent = name;
  });
  if (location.protocol === 'file:') {
    var note = document.getElementById('file-note');
    if (note) note.hidden = false;
  }
})();
