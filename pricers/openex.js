// This file written for Kraken-Grid by Dave Scotese
// Feel free to use it as you please.
import PSCon from 'prompt-sync';

const prompt = PSCon({sigint: true});
const importDynamic = async () => {
    const Gmodule = await import('got');
    const got = Gmodule.default;
    const url = 'https://openexchangerates.org/api/latest.json?app_id=';
    let appId;
    async function OpenEx(base = 'ZUSD', cacheSeconds = 3600) {
        let latest = false;
        const millisWait = 1000 * cacheSeconds;
        let   lastReq = 0;
        async function price(currencySymbol) {
            if(!latest || Date.now() - lastReq > millisWait) {
                const { body } = await got(url+appId);
                latest = JSON.parse(body);
                lastReq = Date.now();
            }
            const USDPrice = 1/latest.rates[currencySymbol];
            return Number((base !== 'ZUSD')
                ? latest.rates[base] * USDPrice
                : USDPrice);
        }
        return {price};
    }
    return ((pricerConfigs, Savings) => {
        if(!pricerConfigs.OpenExAppId) {
            // eslint-disable-next-line no-param-reassign
            pricerConfigs.OpenExAppId = 
                prompt('Enter your OpenExchangeRates App ID:','N/A');
        }
        appId = pricerConfigs.OpenExAppId;
        OpenEx().then(p => {
            Savings.setPricer(p,['XAU','XAG']);
        });
    });
};
  
export default importDynamic();