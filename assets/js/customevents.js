
GTheme.events = {
    registerParallaxEvent: function(){
        var header = jQuery('.intro-header');
        if(header.length === 0) {
            return;
        }
        var box = jQuery('.post-box');
        console.log('box length = ' + box.length)
        if(box.length === 0) {
            return;
        }
        
        var parallax = function() {
            var pxv = jQuery(window).scrollTop() / 5;
            var offset = parseInt(box.css('margin-top'), 50);
            var max = 96 + offset;
            console.log('In parallax');
            if(pxv > max) {
                pxv = max;
            }
            header.css({
                transform: 'translate3d(0,' + pxv + 'px, 0)'
            });
        };
        GTheme.util.listenScroll(parallax);
    },

    logToConsole: function() {
        if(!('console' in window)) {
            return;
        }

        console.log('Register GTheme');
    }
}