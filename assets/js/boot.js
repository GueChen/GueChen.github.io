GTheme.boot = {};

GTheme.boot.registerEvents = function() {
    GTheme.events.logToConsole();
    GTheme.events.registerParallaxEvent();
};

document.addEventListener('DOMContentLoaded', function(){
    GTheme.boot.registerEvents();
});
