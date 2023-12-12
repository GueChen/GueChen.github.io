var TypePageTitle = function(el, title, period, cursor){
    this.el         = el;
    this.full_title = title;
    this.period     = parseInt(period, 10) || 500;
    this.txt        = '';
    this.cursor     = cursor;
    this.completed  = false;
    this.display_cursor = false;
    this.tick();
};

TypePageTitle.prototype.tick = function() {
    
    if(!this.completed){
        this.txt = this.full_title.substring(0, this.txt.length + 1);
    }

    if(this.txt.length === this.full_title.length){
        this.completed = true;
    }
    var title_part = '<span class="titlewrap">' + this.txt + '</span>';

    this.display_cursor = !this.display_cursor;
    

    var cursor_part = '&nbsp;&nbsp;';
    if(this.display_cursor){
        cursor_part = this.cursor;
    }
    cursor_part = '<span class="titlewrap">' + cursor_part + '</span>';

    this.el.innerHTML = title_part + cursor_part;
    
    var that = this;
    setTimeout(function(){
        that.tick();
    }, this.period);
};


window.onload = function(){
    // scan all elements with class
    var elements = document.getElementsByClassName('typetitle');
    for(var i = 0; i < elements.length; ++i) {
        var title  = elements[i].getAttribute('data-title');
        var period = elements[i].getAttribute('data-period');
        var cursor = elements[i].getAttribute('data-cursorsymbol');
        if(title) {
            new TypePageTitle(elements[i], title, period, cursor);
        }
        else{
            console.warn('title not exist, pls check html el');
        }
    }

    // inject css
    var css = document.createElement('style');
    css.innerHTML = ".typetitle > .titlewrap { color:0xffffff }";
    document.body.appendChild(css);
};