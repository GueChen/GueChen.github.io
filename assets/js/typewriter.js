// shamelessly lifted code http://codepen.io/hi-im-si/pen/DHoup
var TxtType = function(el, contents, period) {
    this.contents = contents;
    for(var i = 0; i < contents.length; ++i)
    {
        this.contents[i] = this.contents[i].replace(/-/gi, ' ');
    }
    this.el = el;
    this.loop_num = 0;
    this.count = 0;
    this.next_char_delta = Math.random() * 200;
    this.delta  = 10;
    this.period = parseInt(period, 10) || 2000;
    this.txt = '';
    this.isDeleting = false;
    this.tick();
};

TxtType.prototype.tick = function() {
    // decide which txt to use
    var i = this.loop_num % this.contents.length;
    var full_txt = this.contents[i];
    
    // 
    this.next_char_delta -= this.delta;
    
    if(this.next_char_delta < 0){
        if (this.isDeleting) { // delete char 
            this.txt = full_txt.substring(0, this.txt.length - 1);
            this.next_char_delta /= 2;
        } else {               // add char
            this.txt = full_txt.substring(0, this.txt.length + 1);
            this.next_char_delta = 200 - Math.random() * 150;            
        }
    }
    
    this.count %= 120;
    var bDeletingWork = (this.isDeleting && this.txt.length < full_txt.length);
    if((bDeletingWork) || this.count < 60){
        this.el.innerHTML = '<span class="wrap">' + this.txt + '</span>';
    }
    else{
        this.el.innerHTML = this.txt;
        if(this.txt === '') {
            this.el.innerHTML = '<span class="wrap">' + this.txt + '</span>';
        }
    }
    if(!(bDeletingWork)){
        this.count++;
    }

    if (!this.isDeleting && this.txt === full_txt) {
        this.next_char_delta = 2000;
        this.isDeleting = true;
    } else if (this.isDeleting && this.txt === '') {
        this.next_char_delta = 200;
        //this.delta = 10;
        this.isDeleting = false;
        this.loop_num += 1;
    }

    var that = this;
    setTimeout(function() {
        that.tick();
    }, this.delta);
};

window.onload = function() {
    var elements = document.getElementsByClassName('typewrite');
    console.info(elements.length.toString() + " ele")
    for (var i=0; i<elements.length; i++) {
        var contents = elements[i].getAttribute('data-type');
        console.info(contents)
        var period = elements[i].getAttribute('data-period');
        if (contents) {
            new TxtType(elements[i], JSON.parse(contents), period);
        }
    }
    // INJECT CSS
    var css = document.createElement("style");
    css.type = "text/css";
    css.innerHTML = ".typewrite > .wrap { border-right: 0.08em solid #fff}";
    document.body.appendChild(css);
};