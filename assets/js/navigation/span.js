
class span {
    constructor(inMinH, inMaxH){
        this.next = null;
        this.minH = inMinH;
        this.maxH = inMaxH;
    }

    setNext(nextSpan){
        this.next = nextSpan;
    }

    getNext(){
        return this.next;
    }
}

class spanGrids {
constructor(inSize){
    this.size = inSize;
    this.spans = new Array(inSize * inSize).fill(null);
}

addSpan(inX, inY, inMinH, inMaxH){
    const index = inX + inY * this.size;
    const newSpan = new span(inMinH, inMaxH);
    if (this.spans[index] === null) {
        this.spans[index] = newSpan;
    } else {
        let currentSpan = this.spans[index];
        while (currentSpan.getNext() !== null) {
            currentSpan = currentSpan.getNext();
        }
        currentSpan.setNext(newSpan);
    }
}
}

export {spanGrids};