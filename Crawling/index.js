"use strict";

const { chromium } = require('playwright');
const { products } = require('./file.json');
const fs = require('fs');

// Classes

class Website {

    constructor(url, category, productSelector, amountOfProducts) {
        this.url = url;
        this.category = category;
        this.productSelector = productSelector;
        this.amountOfProducts = amountOfProducts;
        this.init();
    }

    #fixPrice(strPrice) {
        let cents;
        let dollars;
        switch (true) {      
            // Can expand for more uncommon price formats      
            case strPrice.includes('or'):
                let individualPrice = strPrice.split('or');
                cents = individualPrice[1].slice(-2);
                dollars = individualPrice[1].replace('$', '').replace(cents, '');
                let dollarsStr = '';
                for (let i = dollars.length - 1; i > 0; i--) {
                    if (dollars[i] === '/') break;
                    dollarsStr += dollars[i];
                }
                return parseFloat(dollarsStr + '.' + cents);
            default:
                cents = strPrice.slice(-2);
                dollars = strPrice.replace('$', '').replace(cents, '');
                return parseFloat(dollars + '.' + cents);
        }
    }

    #fixDimension(strDimension) {
        switch (true) {
            // Expand cases
            default:
                let dimensions = strDimension.split(' ');
                return dimensions[dimensions.length - 3] + ' ' + dimensions[dimensions.length - 2] + ' ' + dimensions[dimensions.length - 1] + ' inches';
        }
    }

    async init() {
        // Primary init to check if website is accessible
        const browser = await chromium.launch();
        const page = await browser.newPage();
        try {
            await page.goto(this.url);
        } catch (error) {
            //console.log(error)
            throw Error('Could not create website object');
        }
        await browser.close();
    }

    async crawl() {
        const browser = await chromium.launch({ headless: false});
        const context = await browser.newContext();
        const mainPage = await context.newPage();
        
        await mainPage.goto(this.url);
        
        const categoryLocator = await mainPage.getByText(this.category).all();
        
        if (categoryLocator.length === 0) {
            await browser.close();
            return console.log(this.category + ' category not found');
        }
        for (const e of categoryLocator) {
            if (e.isVisible()) {
                try {
                    await e.click({ timeout: 900 });
                }
                catch (error) { continue };
                break;
            } else {
                // Expand code here
            }
        }

        await mainPage.locator(this.productSelector).first().waitFor();
        const productsFound = await mainPage.locator(this.productSelector).all();

        // code particular for Walgreens
        let counter = this.amountOfProducts + 12;

        for (let i = 12; i < counter; i++) {
            const [productPage] = await Promise.all([
                context.waitForEvent('page'),
                await productsFound[i].click({ button: "middle"}),

            ]);

            await productPage.waitForLoadState();
            console.log(productPage.url());

            try {
                await productPage.locator('#productTitle').waitFor({ timeout: 4000 });
            } catch (error) {
                await productPage.close();
                counter++;
                continue;
            }

            let productName = await productPage.locator('#productTitle').innerText();

            let listPrice;

            try {
                await productPage.locator('#sales-price').waitFor({ timeout: 500 });
                let price = await productPage.locator('#sales-price').textContent();
                listPrice = this.#fixPrice(price);
            } catch (error) {
                let price = await productPage.locator('#regular-price').textContent();
                listPrice = this.#fixPrice(price);
            }

            await productPage.locator('#prodDesc').waitFor();
            let description = await productPage.locator('#prodDesc p').first().textContent();

            let productDimensions = this.#fixDimension(await productPage.locator('.universal-product-inches').textContent());

            let imageURLs = [];
            await productPage.locator('#thumbnailImages img').first().waitFor();
            let imagesLocator = await productPage.locator('#thumbnailImages img').all();
            for (let i = 0; i < imagesLocator.length; i++) {
                let srcUrl = await imagesLocator[i].getAttribute('src')
                imageURLs.push('https:' + srcUrl);
            }

            let productUPC = await productPage.locator('tr:nth-child(7) td').textContent();

            let sourceURL = productPage.url();

            let productObject = {
                productName,
                listPrice,
                description,
                productDimensions,
                imageURLs,
                productUPC,
                sourceURL
            }
            new Product(productObject);
            await productPage.close();
        }
        await browser.close();
    }

    get _url() { return this.url; }
    get _productSelector() { return this.productSelector; }
    get _category() { return this.category; }
    get _amountOfProducts() { return this.amountOfProducts; }

}

class Product {

    constructor(productObject) {
        this.id = products.length + 1;
        this.productName = productObject.productName;
        this.listPrice = productObject.listPrice;
        this.description = productObject.description;
        this.productDimensions = productObject.productDimensions;
        this.imageURLs = productObject.imageURLs;
        this.productUPC = productObject.productUPC;
        this.sourceURL = productObject.sourceURL;
        this.init();
    }

    init() {
        products.push({product: this});
        fs.writeFile('file.json', JSON.stringify({products}), (err) => { if (err) throw err;});
    }

}

const walgreens = new Website('https://www.walgreens.com', 'Household Essentials', '.product__img', 10);
walgreens.crawl();