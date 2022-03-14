# kraken-grid
A bot that extends grid trading once you use it to create a grid using orders with conditional closes.

This was developed with NodeJS running in the BASH shell provided by Windows 10.  I believe it's using "Windows Subsystem for Linux" and that there are some oddities because of this.  I don't see them as odd because I'm not familiar enough with Linux yet.

## Installation
Once the file (kraken-grid.js) is installed with the dependencies (NPM and/or Node figures this out), you can run it and it will save a file`keys.txt to your home folder. 

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
   1.  replace conditional closes resulting from partial executions with a single conditional close which, itself, has a conditional close to continue buying and selling between the two prices, but only up to the amount originally specified, and _only_ for orders with a User Reference Number (such as all orders placed through this program).
   2.  fill out the internal record of buy/sell prices using the open orders and their conditional closes (see `set` and `reset`).
   3.  extend the grid if there are only buys or only sells remaining for the crypto identified in each order.
   4.  identify any orders that are gone or new using Kraken's Order ID and for new orders, it also describes them.

### list [SEARCH]
This simply prints out a list of all the orders the code last retrieved (it does NOT retrieve them again, so...) It may have orders in it that have already been executed.  Each order is presented as:
`Counter amount pair @ limit price [with A:B leverage] userref [close position @ limit price]`
...where:
* `Counter` gives you a handle to use for other commands like delev and kill
* `Amount` is the number of coins
* `Pair` is symbol (see `buy`) with the 'USD' suffix.
* The bracketed item will be missing for an order with default leverage or an order without a conditional close.
* `userref` is a user-reference number derived from the UNIX TimeStamp when the order was placed.  Extending the grid to higher sells uses a userref 10,000,000 less than the current highest sell's userref, and extending it to lower-priced buys uses a userref 1,000,000 less than the current lowest buy's userref.  The last six digits of all userrefs are assumed to be different for every order.

If you enter anything for [SEARCH], the list will only display lines that contain what you entered, except in one case, C.  If it's just the C, it will retrieve the last 50 orders that are no longer open (Filled, Cancelled, or Expired), but only list those that actually executed (Filled).  If you add the userref then it will fetch only orders with that userref, which means the buys and sells at one grid point. See `set` for a list of them.  Such orders also include the time at which the order filled completely.

### set
This lists the `userref`s and prices at which buys and sells have been (and will be) placed.

### reset
This erases the list of `userref`s and prices at which buys and sells will be placed, but that list gets immediately rebuilt because it performs the second step in `report`.

### auto
`auto N`
This automatically and repeatedly executes the second step of `report` and then waits N seconds.  N defaults to 60 but when you call auto with a new value for it, it is updated.  ***NOTE: See Internals below to understand how using `buy` or `sell` can block this repetition.***

### manual
This stops the automatic calling of `report`.  The bot will do nothing until you give it a new command.

### margin
The bot will try to use leverage when there isn't enough USD or crypto.  Whether or not it succeeds, it will still be able to report how much you are logn or short for each supported crypto.  Reporting that is all this command does.

### kill
`kill X`
X can be an Order ID from Kraken (recognized by the presence of dashes), a userref (which often identifies more than one order, and, importantly, _both_ the initial buy or sell, _and_ the series of sells and buys resulting from partial executions), or a `Counter` as shown from `list`.  This cancels the order or orders.  Interestingly, I think `list` will still show it unless you run `report` first to update the internal record of open orders.

### delev
`delev C`
C _must be_ a `Counter` as shown by executing `list`.  If the identified order uses leverage, this command will first create an order without any leverage to replace it, and then kill the one identified. The order that was killed will still be in the list, prefixed with "killed:" ***NOTE: The new order often (or always?) appears at the top of `list` after this, so the `Counter`s identifying other orders may change.

### addlev
`addlev C`
The semantics are the same as for `delev`.

### refnum
`refnum C R`
C _must be_ a `Counter` as shown by executing `list`, and it must be an order that was entered without a userref.  All orders added by the bot (automatically and manually) have a userref.  This function is to allow you to enter an order at trade.kraken.com and then include it into an existing grid point by using that grid point's refnum (see `set`) as R.  

### addlev
`addlev C`
The semantics are the same as for delev.

### refnum (on bleeding branch only)
`refnum C newRef`
C _must be_ a `Counter` as shown by executing `list` which has a user reference number of 0.  This command can be used with an externally generated order (which therefore has a user reference number of 0) to tie it into the grid, by assigning it a user reference number as displayed in `list`.

### verbose
There is a little bit of logic in the code to spit out a lot more information when verbose is on.  It's off by default and this command just toggles it.

### safe
When the bot starts, it is in "safe" mode, which means that it will not __actually__ add or cancel any orders.  The idea is that it won't do anything, but instead just show you what it would do if __safe__ were off.  Your have to enter `safe` to turn this off so that the bot will actually do things.  It allows for startup with a lot less rish with a possible buggy bot.

### ws - EXPERIMENTAL
This connects to Kraken's WebSockets, which, I have to warn you, send you something about every second, and sometimes silently disconnects.

## Internals
When you place an order through trade.kraken.com or through kraken.com, it will have a `userref` of zero.  It will be displayed but ignored for the purposes of the grid trading it does.  When you place an order through the bot, it will have a userref and the bot will assume you have not yet decided at what price to close it.  

## HELP!
This code is messy and monolithic.  It works for me and I didn't want to keep waiting until I cleaned it up to publish it.  I haven't yet put enough thought into how (and whether) I would break it up into smaller files with specific purposes, so I'd love to see proposals.  One of the major motivations I have for publishing it is that as more people use a strategy like "grid trader" to balance their savings, the prices of the cryptos with which they do it will become more stable.

All calls to @nothingisdead's [Kraken-API](https://github.com/nothingisdead/npm-kraken-api) (which I have copied and renamed to kraka-djs to add CancelAll) are made through a function I called `kapi` so that any other exchange could be used by updating that funtion to translate Kraken's APIs to those of other exchanges.
