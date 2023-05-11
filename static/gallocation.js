/* This module provides an object that lets you dynamically create a pie chart. */
function galloc(context) {
    const canvas = context.canvas;
    let lastColors = [];
    
    function clear() { context.reset(); }

    // RnotL tells the function which side of the pie should display the names.
    // to hide the legend, pass an empty array for names.
    function pie(names, slices, x = 0, y = 0, RnotL, colors=lastColors, bigger = 0) {
        const centerX = canvas.width / 2 + x;
        if(colors.length == 0) colors = lastColors;
        const centerY = canvas.height / 2 + y;
        const radius = canvas.height / 3 + bigger;
        // textSide goes to the right or left of the pie by the radius plus a margin.
        // The margin is half the radius.
        // It should go 100px further to the left because the legend is 100px wide.
        const textSide = (RnotL?1:-1)*(radius*1.5-50)+50;
        context.lineWidth = 2;
        context.strokeStyle = '#000000';
        let total = slices.reduce((sum,slice) => sum + slice);
        let hand = 0, arc, color;
        slices.forEach((val,index) => {
            context.beginPath();
            context.lineTo(centerX,centerY);
            arc = hand + 2 * Math.PI * val / total;
            context.arc(centerX, centerY, radius, hand, arc, false);
            hand = arc;
            context.lineTo(centerX,centerY);
            color = colors[index] ||
                '#'+(Math.floor(Number(0x404040) + Math.random() * Number(0xBFBFBF))).toString(16);
            lastColors[index] = color;
            context.fillStyle = color;
            context.fill();
            context.stroke();
            if(names.length > 0) {
                context.fillRect(centerX+textSide,index * 25,100,20);
                context.font = "bold 15px serif";
                context.fillStyle = '#000000';
                context.fillText(names[index]||'',centerX + textSide,15 + index * 25);
            }
        });
    }
    return {pie,clear};
}
