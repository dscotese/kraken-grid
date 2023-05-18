/* This module provides an object that lets you dynamically create a pie chart. */
function galloc(context) {
    const canvas = context.canvas;
    let centerX, centerY;
    let lastColors = [];
    
    function clear() { context.reset(); return this; }

    // legend indicates how many pixels to the left (-) or right (+)
    // it should be shown, if at all.  Empty string means no legend.
    // Otherwise, no legend is shown..
    // to hide the legend, pass an empty array for names.
    // slices is an associative array, [name:[value, color]]
    function pie(slices, x = 0, y = 0, legend='', bigger = 0) {
        //if(colors.length == 0) colors = lastColors;
        const radius = canvas.height / 3 + bigger;
        // textSide goes to the right or left of the pie by the radius plus a margin.
        // The margin is half the radius.
        // It should go 100px further to the left because the legend is 100px wide.
        const textSide = legend != '' 
            ? Math.sign(legend)*radius + legend - 100
            : 0;
        centerX = canvas.width / 2 + x;
        centerY = canvas.height / 2 + y;
        context.lineWidth = 2;
        let hand = 0, arc, color, colors=[], path, paths = {}, vals=[],
            total = Object.values(slices).reduce((sum,slice) => {
                vals.push(slice[0]);
                colors.push(slice[1]);
                return sum + Math.abs(slice[0]);
            },0),
            names = Object.keys(slices);            
        context.strokeStyle = '#000000';    // black outline
        vals.forEach((val,index) => {
            path = new Path2D(); //context.beginPath();
            context.moveTo(centerX,centerY);
            arc = hand + 2 * Math.PI * Math.abs(val) / total;
            path.arc(centerX, centerY, radius, hand, arc, false);
            hand = arc;
            path.lineTo(centerX,centerY);
            context.stroke(path);
            color = colors[index] ||
                '#'+(Math.floor(Number(0x404040) + Math.random() * Number(0xBFBFBF))).toString(16);
            lastColors[index] = color;
            context.fillStyle = color;
            context.fill(path);
            if(legend != '') {
                context.fillRect(centerX+textSide,index * 25,38,20);
                context.font = "bold 15px serif";
                context.fillStyle = '#000000';
                context.fillText(names[index]||'',centerX + textSide + 40,15 + index * 25);
            }
            paths[names[index]] = path;
        });
        // Go through again to arc in red and green.
        if(!!vals.find(n => n<0)) { // if any values are negative
            hand = 0;
            context.lineWidth = 4;
            vals.forEach((val,index) => {
                context.moveTo(centerX, centerY);
                context.beginPath();
                context.strokeStyle = val<0 ? '#f01010' : '#10f010';
                arc = hand + 2 * Math.PI * Math.abs(val) / total;
                context.arc(centerX, centerY, radius, hand, arc, false);
                hand = arc;
                context.stroke();
            });
        }
        // Return an instance with specifics
        return Object.freeze({ pie, clear, markup, context, colors:lastColors,
            centerX, centerY, radius, paths, slices });
    }

    // This will add text to the canvas.  (x,y) is relative to the pie's center,
    // and delineates the bottom-middle point of the text..
    function markup(text, x, y, 
        back='#ffffff', font="bold 15px serif", color="#000000") {
        context.font = font;
        tSize = context.measureText(text);
        tx = this.centerX + x -tSize.width/2;
        ty = this.centerY + y;
        context.fillStyle = back;
        context.fillRect(tx-2,ty+2,tSize.width+4,-tSize.fontBoundingBoxAscent-4);
        context.fillStyle = "#000000";
        context.fillText(text,tx, ty);
        return this;
    }

    return {pie,clear,markup,context};
}
