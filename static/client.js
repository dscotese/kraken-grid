const $ = jQuery;
var data=false, tkrs = [], auto=-1, genTol;
let G = galloc($('#myCanvas')[0].getContext("2d"));
// The thumbnails for cryptos were collected from https://api.coingecko.com/api/v3/coins/
function setCookie(cname, cvalue, exdays) {
    const d = new Date();
    d.setTime(d.getTime() + (exdays*24*60*60*1000));
    let expires = "expires="+ d.toUTCString();
    document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
}

function getCookie(cname, def="") {
    let name = cname + "=",
        decodedCookie = decodeURIComponent(document.cookie),
        ca = decodedCookie.split(';');
    for(let i = 0; i <ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
            return c.substring(name.length, c.length);
        }
    }
    return def;
}

function setSize(id) {
    let docXY = getCookie(id+'XY'),
        [docw,doch] = docXY.split('.'),
        jqdd = $('#'+id),
        docdiv = jqdd[0];
        sw = docdiv.offsetWidth-docdiv.clientWidth,
        sh = docdiv.offsetHeight-docdiv.clientHeight;
    docw = Math.max(docw,200);
    doch = Math.max(doch,200);
    jqdd.width(Number(docw) + sw);
    if(!['LDiv'].includes(id)) jqdd.height(Number(doch) + sh);
}

$(function() {
    ['Doc','GDiv','LDiv'].forEach(setSize);
    genTol = Number(getCookie('genTol',"0.025"));
    $("#GDiv").prepend("<div id='gtop'><a href='javascript:useData(data);'>Redraw</a>"
        +"<span id='notice'></span>"
        +"<span id='safe' class='setting'></span>"
        +"<span id='verbose' class='setting'></span>"
        +"<span id='risky' class='setting'></span>"
        +"<a href='javascript:getData(data);'>Refresh</a></div>");
    let wst=0,
         ro = new ResizeObserver( (entries) => { 
            window.clearTimeout(wst); 
            let e = entries[0],
                id = e.target.id;
            wst = window.setTimeout( () => {
                docw = e.contentRect.width;
                doch = e.contentRect.height;
                setCookie(id+"XY",docw+'.'+doch,3650);
                if(e.target.id == 'GDiv' && data) useData(data);
                },1000);
            if(e.target.id == 'GDiv') PieDiv();
        });
    ro.observe($('#Doc')[0]);
    ro.observe($('#GDiv')[0]);
    ro.observe($('#LDiv')[0]);
    // $('md-block').on('md-render',() => {
        $('#Doc').on('click','code',(data) => {
            let t = data.target,
                txt = t.innerHTML,
                yn = prompt("Send a command to the bot?",txt);
            if(yn) {
                botExec(yn);
            }
        });
    // });
    armAssets();
    armAlloc();
    getData();
    $('#myCanvas').on('click',mousePie);
    $(".setting").on('click',(e) => {botExec(e.target.getAttribute('id'))});
});

function stopRefresh() { window.clearTimeout(auto); }

function getData() {
    $('#notice').html("Refreshing...");
    $.ajax({
        url: '/data', 
        dataType: 'json',
        success: (dataR) => { useData(dataR); },
        error: (jqXHR, textStatus, error) => {
            window.clearTimeout(auto);
            alert("Auto refresh stopping because:\n" + JSON.stringify(textStatus,error)); 
            },
        complete: () => { $('#notice').html(''); }
    });
}
var imgs = [],
    colors = [];

function setColors(d) {
    let i;
    if(colors.length!=Object.keys(d).length 
        || -1 != colors.findIndex(c => !(c instanceof CanvasPattern))) {
        colors = [];
        Object.keys(d).forEach(k => {
            if(!imgs[k]) {
                i = document.createElement("img");
                i.setAttribute('src',imgByKtick[k]);
                imgs[k] = i;
            }
            try {
                colors[k] = G.context.createPattern(imgs[k],'repeat');
            } catch(e) { 
                console.log(k,e); 
                let randColor = '#' + Math.floor(
                    0x404040 + Math.random()*0xBFBFBF).toString(16);
                colors.push(randColor);
            }
        });
    }
}

function PieDiv() { //canvasHolder=false) { // Pass the JQuery object that selects the div.
    canvasHolder = false;
    let d = data.desired,
        docdiv = $('#GDiv')[0];
        sw = docdiv.offsetWidth-docdiv.clientWidth,
        w = Number(('0'+docdiv.style.width).match(/[0-9]+/)[0]),
        h = Number(('0'+docdiv.style.height).match(/[0-9]+/)[0]),
        slices = [];    // Associative array [name:[value,color]]

    Object.keys(data.tickers).forEach((t) => {
        if(d[t]) slices[t] = [d[t],colors[t]];
    });
    
    G.desired = G.pie(slices,-w/4,0);
    let underPie = G.desired.radius/2;
    G.desired.markup("Target Allocation",0,underPie)
        .markup("Total: "+sigdig(data.total,6,2)+' '+data.numer, 0, underPie+20);
}

function mousePie(e) {
    let cmd = false;
    if(G.desired.paths) {
        let dps = G.desired.paths;
        for(k in dps) { // iterate over tickers, the keys
            if(G.context.isPointInPath(dps[k], e.offsetX, e.offsetY)) {
                let def = data.desired[k];
                cmd = prompt("Update allocation percentage?",
                    "allocate "+k+' '+def);
            }
        }
    }
    if(G.bns.paths) {
        let bps = G.bns.paths;
        for(k in bps) {
            if(G.context.isPointInPath(bps[k], e.offsetX, e.offsetY)) {
                let del = G.bns.slices[k][0],
                    price = data.tickers[k][1],
                    amt = sigdig((Math.abs(del/100)*data.total/price),6,8);
                cmd = prompt("Send this trade to the bot?",
                    (del<0?"sell ":"buy ")+k+' '+price+' '+amt);
            }
        }
    }
    if(cmd) botExec(cmd);
}

function useData(d) {
    data = d;
    let can = $('#myCanvas')[0],
        docdiv = $('#GDiv')[0],
        sw = docdiv.offsetWidth-docdiv.clientWidth,
        sh = docdiv.offsetHeight-docdiv.clientHeight,
        w = Number(('0'+docdiv.style.width).match(/[0-9]+/)[0]),
        h = Number(('0'+docdiv.style.height).match(/[0-9]+/)[0]);
    can.width=w-sw-2;
    can.height=h-sh-25;
    // G.clear();
    tkrs = [];
    Object.keys(data.tickers).forEach(t => {tkrs[t] = 0;});
    setColors(data.desired);
    let assets  = AssetsTable(),
        allocs  = AllocTable(genTol), // Since this computes differences, it makes the pie too.
        ords    = OrderTable();
    PieDiv();
    $('#LDiv').html('').append(a1 = document.createElement("div"));
    $('#RDiv').html('').append(o1 = document.createElement("div"));
    $('#LDiv').append(a2 = document.createElement("div"));
    a1.innerHTML = assets;
    a2.innerHTML = allocs;
    o1.innerHTML = ords;
    armAssets();
    armAlloc();
    armOrderTable();
    let f = data.FLAGS,jqs;
    for(s in f) {
        jqs = $('span#'+ s);
        jqs.html(s+" is "+(f[s]?'on':'off'));
        jqs.css( "background", f[s]?"pink":"white" );
    }
    if(auto > -1) window.clearTimeout(auto);
    if(d.refresh_period > 0)
        auto = window.setTimeout(getData, 1000 * d.refresh_period);
}
    
function sigdig(x,sig=6,dp=6) {
    let sd = Math.min(dp,Math.floor(sig-Math.log10(Math.abs(x)))),
        mag = 10**sd;
    return Math.round(mag*x)/mag;
}

function weblink(tkr) {
    if(tkr == data.numer) return data.numer;
    return "<a href='https://trade.kraken.com/charts/KRAKEN:" +
        (tkr[0] == 'X' && tkr.length == 4
            ? tkr.substr(1) : tkr) +
        "-" + data.numer.substr(1)
        +"' target='chart'>"+tkr+"</a>";
}

function AssetsTable() {
    let Savs = data.savings,assets,
        total = data.total,
        tbody = "",
        zeroes = "Tickers not in your savings: ",
        ktks = tkrs ? Object.keys(tkrs) : [],
        ret = "",rows = [], // rows is an associative array of object arrays.
        tkr,amt,ki,label,tkrl,sav; // ktks is "Known Tickers"
    rows[''] = [{key:'AAAA',val:"<th title='Total Value'>"
        +sigdig(total,10,2)+"</th>"}].concat(ktks.map((e,i,a) => {
            return { key:e, val:"<th>"+weblink(e)+"</th>" }; }));
    // Add exchange assets to list of "Savings Accounts"
    for(t in tkrs) { tkrs[t] = 0; };
    for(h = 0; h <= Savs.length; ++h) {
        ki = 0;
        sav = h == Savs.length
            ? data.exsaves
            : Savs[h];
        label = sav.label;
        assets = sav.assets.sort((a,b)=>{return a.ticker<b.ticker?-1:1;});
        rows[label] = [{key:'AAAA',val:"<th>"+label+"</th>"}];
        for(a = 0; a < assets.length; ++a) {
            [tkr,amt] = [assets[a].ticker,assets[a].amount];
            rows[label].push({key:tkr,
                val:"<td tkr='"+tkr+"' acct='"+label+"' amt='"+amt+"'>"+amt+"</td>"});
            if(isNaN(tkrs[tkr])) {
                tkrs[tkr]=amt;          // Initialized.
                rows[''].push({key:tkr, val:"<th>" + weblink(tkr) + "</th>"});
                ktks.push(tkr);
                ki += 1;
            } else tkrs[tkr] += amt;    // Totals for ticker indices.
        }
    }
    rows['ZTotal'] = [{key:'AAAA',val:"<th>Totals</th>"}];
    ktks = ktks.sort();
    for(t of ktks) {
        rows['ZTotal'].push({key:t,val:"<th>"
            + ( tkrs[t]>0 ? sigdig(tkrs[t],8,2) : '' ) +"</th>"});
        if(tkrs[t] == 0) { // Hiding zeroes in table.
            let header = rows[''].find(r=>{return r.key==t;});
            zeroes += ' ' + weblink(t);
            header.val = "<th></th>";
        }
    }
    for(r in rows) {
        rows[r].sort((a,b)=> { return a.key<b.key ? -1 : 1; });
        let asString = "",rs;
        ki = 0;
        for(s in rows[r]) {
            rs = rows[r][s];
            if(rs.key != 'AAAA') {
                while(ki<ktks.length && ktks[ki++] != rs.key) asString += "<td></td>";
            }
            asString += rs.val;
        }
        // <td>s needed at the end
        let tail = ktks.length - ktks.findIndex(e=>{return e==rows[r].at(-1).key;});
        asString += "<td></td>".repeat(tail-1);
        tbody += "<tr>" + asString + "</tr>\n";
    }
    ret = zeroes+"<br/><table id='assets'>"+tbody+"</table>";
    return ret;
}

function armAssets() {
    $("#assets td").on('click',(data) => {
        let t = data.target,
            acct = t.getAttribute('acct'),
            amt = t.getAttribute('amt'),
            tkr = t.getAttribute('tkr'),
            cmd = "asset "+tkr+' '+amt+' '+acct+' false',
            ask = "Update "+acct+' from '+amt+tkr+ "?";
        if( acct == 'OnExchange' ) {
            ask = "Edit this command to add an asset.\n"
                + "If the Ticker is for something not on the\n"
                + "exchange, change false to true or else\n"
                + "the bot will ask for confirmation in the\n"
                + "console.";
            cmd = "asset Ticker Units Account false";
        }
        cmd = prompt(ask,cmd);
        if(cmd) botExec(cmd);
    });
}

function AllocTable(tol = genTol) {
    let ret = "<table id='alloc'><tr><th colspan='"
        + (1+Object.keys(tkrs).length)
        + "'>Allocation Last Update: " + (new Date()).toLocaleTimeString()
        + "</th></tr>\n<tr id='tkrs'><th id='tol' title='Balance Tolerance'>"+tol+"</th>",
        current="<tr id='current'><th>Current</th>",
        desired="<tr id='desired'><th>Desired</th>",
        diff = "<tr id='Diff'><th>Difference</th>",
        diffs = [],
        gHeight = Number(('0'+$('#GDiv')[0].style.height).match(/[0-9]+/)[0]),
        gWidth = Number(('0'+$('#GDiv')[0].style.width).match(/[0-9]+/)[0]),
        prices = "<tr id='Prices'><th>Prices</th>",
        c,d,del,tt,price,imbalance = 0, slices=[];
    for(t in tkrs) {
        ret += "<th>"+t+"</th>";
        current += "<td>"+(c=data.current[t])+"%</td>";
        desired += "<td"+(t==data.numer ? '' 
            : " title='allocate "+t+" "+data.desired[t]+"'") +">"
            + (d=data.desired[t])+"%</td>";
        price = data.tickers[t][1];
        prices += "<td"+(t == data.numer ? ''
            : " title='balance "+tol+' '+t+"'")+">"+price+"</td>";
        del = d-c;
        if(!isNaN(del)) slices[t] = [del,colors[t]];
        if(del>0) imbalance += del;
        tt = (del > 0 ? 'buy ' : 'sell ')+t+' '+price+' '
            +(sigdig((Math.abs(del/100)*data.total/price),6,8));
        diff += "<td"+(t==data.numer ? ''
            : " title='"+tt+"'")+">"+sigdig(del,5,2)+"</td>";
    };
    imbalance *= data.total/100;
    G.bns = G.pie(slices,gWidth/4,0, -25);
    let underPie = G.bns.radius/2;
    G.bns.markup("Buys and Sells for Balance",0,underPie)
        .markup("Total: "+sigdig(imbalance,6,2)+' '+data.numer ,0,underPie+20);

    ret += "</tr>\n"+current+"</tr>\n"+desired+"</tr>\n"+diff+"</tr>\n"
        + prices + "</tr></table>";
    return ret;
}

function armAlloc() {
    $("#Diff td[title],#Prices td[title], #desired td[title]").on('click',(e)=>t2Command(e));
    $("th#tol").on('click',(data) => {
        let tol = Number(data.target.innerHTML);
        newTol = prompt("Set balancing tolerance percentage to:",genTol);
        if(newTol) {
            if(isNaN(newTol)) alert("Tolerance must be a number.");
            else {
                data.target.innerHTML = newTol;
                setCookie('genTol',newTol);
                // Update the commands
                $("#Prices td").attr('title',(i,ov) => {
                    return ov.replace(/[0-9.]+/,newTol);
                });
            }
        }
    });
}

var ordSort = 'ID';
function OrderTable() {
    let neg = (ordSort[0]=='-'),
        oo, od, odo, parsed, ret = "<table id='oDiv'><tr><th>ID</th><th>Type</th>"
            + "<th>Units</th>"
            + "<th>Pair</th><th>Price</th><th>UserRef</th><th>Close</th></tr>";
    data.orders.forEach((o,i) => {
        oo = o[1];
        oo['ID'] = oo['ID'] || i+1;
    });
    data.orders.sort((a,b) => {
        let aval = orderCompare(ordSort, a),
            bval = orderCompare(ordSort, b);
        return (neg ? -1 : 1) * (aval < bval ? -1 :
            (aval == bval ? 0 : 1));
    });
    data.orders.forEach((o,i) => {
        oo = o[1];
        od = oo.descr;
        odo = od.order;
        parsed = odo.split(' ');
        ret += "\n<tr>" + tag('td',oo['ID'],"title='"+o+"'") + tag('td',parsed[0]) 
            + tag('td',parsed[1])+tag('td',parsed[2]) + tag('td',parsed[5])
            + tag('td',oo.userref) + tag('td',od.close.match(/[0-9.]+$/))
            + tag('th','less') + tag('th','more') + tag('th','kill') 
            + tag('th',(oo.descr.leverage=='none'?'add':'de')+'lev') + '</tr>';
    });
    return ret + "</table>";
}
function tag(t,i,attrs){return '<'+t+(attrs ? ' '+attrs : '')+'>'+i+'</'+t+'>';}

function armOrderTable() {
    $('#oDiv th').on('click',(e) => {
        if(!rowCommand(e)) {
            let neg = e.target.innerHTML == ordSort;
            ordSort = (neg ? '-' : '') + e.target.innerHTML;
            $('#oDiv')[0].innerHTML = OrderTable();
            armOrderTable();
        }
    });
}

function rowCommand(e) {
    if(!['less','more','kill','addlev','delev'].includes(e.target.innerHTML)) return false;
    let t = e.target,
        fc = t.parentNode.firstChild,
        KID = fc.getAttribute('title').split(',')[0],
        ID = t.parentNode.firstChild.innerHTML,
        cmd = t.innerHTML,
        params = ' ' + (cmd=='kill'?KID:ID) + ' ' + (['less','more'].includes(cmd)
            ? "(amt) all?" : "");
        t.setAttribute('title',cmd + params);
    t2Command(e);
    return true;
}

function orderCompare(th, order) {
    // ID	Type	Units	Pair	Price	UserRef	Close
    let od = order[1].descr;
    switch(th[0]=='-' ? th.substr(1) : th) {
        case 'ID' : return order[1].opentm;
        case 'Type' : return od.type;
        case 'Units' : return Number(order[1].vol);
        case 'Pair' : return od.pair;
        case 'Price' : return Number(od.price);
        case 'UserRef' : return order[1].userref;
        case 'Close' : return od.close>""
            ? Number(od.close.match(/[0-9.]+$/)[0])
            : 'NA';
    }
    return 0;
}

function t2Command(e) {
    let t = e.target,
        def = t.getAttribute('title'),
        cmd = prompt("Send command to bot?",def);
    if(cmd) botExec(cmd);
}

function botExec(cmd) {
    $.post('/',{data:cmd},(r) => { alert(r); getData();});
}
