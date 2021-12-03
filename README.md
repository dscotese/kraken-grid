# kraken-grid
A bot that extends grid trading once you use it to create a grid using orders with conditional closes.

This was developed with NodeJS running in the BASH shell provided by Windows 10.  I believe it's using "Windows Subsystem for Linux" and that there are some oddities because of this.  I don't see them as odd because I'm not familiar enough with Linux yet.

## Installation
I would like `npm install kraken-grid` to work, and it may work simply because the code is here on Github.  If not, perhaps someone who knows how to make it work will explain that to me. Assuming that doesn't work yet, place the file kraken-grid.js into a folder and then call `node kraken-grid.js` from a console using that folder as its working directory.

Once the file (kraken-grid.js) is installed with the dependencies (NPM and/or Node figures this out), you can run it and it will tell you to save a file `keys.js` to the parent folder after adding your API keys from Kraken to it:
```
exports.key=' **your key goes here** ';
exports.secret=' **Your secret goes here** ';

// If you want private initialization code, (mine backs up the file)
// this is a good place to put it.
```

Once you've done that, the first thing it will do is execute the `report` command, described below.

## Usage
At the prompt that kraken-grid presents (>), you can enter one of these commands:

### buy
`buy [XMR|XBT|ETH|DASH|EOS|LTC|BCH] price amount makeClose`

makeClose is interpreted as a Boolean.  I never tested `0` but I assume 0 means false (the default).  If makeCLose evaluates to true, the code will create this buy with a conditional close at the last price it saw.  If you don't want the code to place a trade with a conditional close, leave makeCLose off.

If you want to use other cryptos, there is a line in `report()` and a line in `handleArgs()` which both need to be changed by adding the symbol.  There's another line in report that assumes that the initial X in _every_ symbol is extraneous.  This is true for the four I hold, XMR, ETH, XBT, and LTC, but check Kraken's AssetPairs to see if it's true for any you add.

### sell
The semantics are the same as for `buy`

### report
This is the default command, meaning that if you don't enter a command, but you hit enter, this command will execute.  It does several things:
1. Retrieves balances for the cryptos listed under `buy` and reports the values in a table:
```
ZUSD    AMT       undefined
XXBT    AMT       PRICE
XLTC ...
...
```
2. Retrieves the list of open orders, which is immediately processed to:
   1.  replace conditional closes resulting from partial executions with a single conditional close which, itself, has a conditional close to continue buying and selling between the two prices, but only up to the amount originally specified.
   2.  fill out the internal record of buy/sell prices using the open orders and their conditional closes (see `set` and `reset`).
   3.  extend the grid if there are only buys or only sells remaining for the crypto identified in each order.
   4.  identify any orders that are gone or new using Kraken's Order ID and for new orders, it also describes them.

### list
This simply prints out a list of all the orders the code last retrieved (it does NOT retrieve them again, so...) It may have orders in it that have already been executed.  Each order is presented as:
`Counter amount pair @ limit price [with A:B leverage] userref [close position @ limit price]`
...where:
* `Counter` gives you a handle to use for other commands like delev and kill
* `Amount` is the number of coins
* `Pair` is symbol (see `buy`) with the 'USD' suffix.
* The bracketed item will be missing for an order with default leverage or an order without a conditional close.
* `userref` is a user-reference number derived from the UNIX TimeStamp when the order was placed.  Extending the grid to higher sells uses a userref 10,000,000 less than the current highest sell's userref, and extending it to lower-priced buys uses a userref 1,000,000 less than the current lowest buy's userref.  The last six digits of all userrefs are assumed to be different for every order.

### set
This lists the `userref`s and prices at which buys and sells have been (and will be) placed.

### reset
This erases the list of `userref`s and prices at which buys and sells will be placed, but that list gets immediately rebuilt because it performs the second step in `report`.

### auto
`auto N`
This automatically and repeatedly executes the second step of `report` and then waits N seconds.  N defaults to 60 but when you call auto with a new value for it, it is updated.  ***NOTE: See Internals below to understand how using `buy` or `sell` can block this repetition.***

### kill
`kill X`
X can be an Order ID from Kraken (recognized by the presence of dashes), a userref (which often identifies more than one order, and, importantly, _both_ the initial buy or sell, _and_ the series of sells and buys resulting from partial executions), or a `Counter` as shown from `list`.  This cancels the order or orders.  Interestingly, I think `list` will still show it unless you run `report` first to update the internal record of open orders.

### delev
`delev C`
C _must be_ a `Counter` as shows by executing `list`.  If the identified order uses leverage, this command will first create an order without any leverage to replace it, and then kill the one identified. ***NOTE: The new order often (or always?) appears at the top of `list` after this, so the `Counter`s identifying other orders may change.

### manual
This stops the automatic calling of `report`.  The bot will do nothing until you give it a new command.

### verbose
There is a little bit of logic in the code to spit out a lot more information when verbose is on.  It's off by default and this command just toggles it.

### ws - EXPERIMENTAL
This connects to Kraken's WebSockets, which, I have to warn you, send you something about every second, and sometimes silently disconnects.

## Internals
When you place an order through trade.kraken.com or through kraken.com, it will have a `userref` of zero.  It will be displayed but ignored for the purposes of the grid trading it does.  When you place an order through the bot, it will have a userref and the bot will assume you have not yet decided at what price to close it.  It will ask _every time_ `report` is called, for example, from `auto` and it will do nothing until you answer.  It will ask for every order that doesn't have a conditional close, and fill out the internal record of prices using your answer.  To skip the rest of its requests for prices, answer with a question mark.  If you're still running `auto`, however, it's going to ask again in N seconds.

### Handling pasted commands
I use Excel to calculate my grid prices so I like to copy the commands that Excel builds for me.  I thought Node would accept multiline iput as several pieces of input but it doesn't.  They are all combined into one large input string that I first broke up using CHR(13) (whatever that was in Javascript, I can't remember now), but process.stdin handles it a little differently. Search for `readable` to see how I handled it.

## HELP!
This code is messy and monolithic.  It works for me and I didn't want to keep waiting until I cleaned it up to publish it.  I haven't yet put enough thought into how (and whether) I would break it up into smaller files with specific purposes, so I'd love to see proposals.  One of the major motivations I have for publishing it is that as more people use a strategy like "grid trader" to balance their savings, the prices of the cryptos with which they do it will become more stable.

All calls to @nothingisdead's [Kraken-API](https://github.com/nothingisdead/npm-kraken-api) are made through a function I called `kapi` so that any other exchange could be used by updating that funtion to translate Kraken's APIs to those of other exchanges.
