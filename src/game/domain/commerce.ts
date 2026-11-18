export type Venue = 'shop'|'cafe';
export type Sku = 'water'|'hotdog'|'chocolate'|'snacks'|'coffee'|'milk'|'cake'|'pie';
export type Product = Sku|'espresso'|'americano'|'cappuccino'|'latte';
export type Supplier = 'standard'|'express'|'budget';
export const SKU:Record<Sku,{name:string;venue:Venue;unit:string;size:number;buy:number;retail?:number}>={
 water:{name:'Вода',venue:'shop',unit:'шт.',size:1,buy:5000,retail:9000},hotdog:{name:'Хот-дог',venue:'shop',unit:'шт.',size:1,buy:8000,retail:15000},
 chocolate:{name:'Шоколадка',venue:'shop',unit:'шт.',size:1,buy:4500,retail:9000},snacks:{name:'Снеки',venue:'shop',unit:'шт.',size:1,buy:6000,retail:12000},
 coffee:{name:'Кофе',venue:'cafe',unit:'г',size:.002,buy:60},milk:{name:'Молоко',venue:'cafe',unit:'мл',size:.001,buy:7},
 cake:{name:'Пирожное',venue:'cafe',unit:'шт.',size:1,buy:9000,retail:17000},pie:{name:'Пирожок',venue:'cafe',unit:'шт.',size:1,buy:7000,retail:13000},
};
export const RECIPES:Record<'espresso'|'americano'|'cappuccino'|'latte',Partial<Record<Sku,number>>>={espresso:{coffee:9},americano:{coffee:9},cappuccino:{coffee:18,milk:150},latte:{coffee:18,milk:250}};
export const PRODUCTS:Record<Product,{name:string;venue:Venue;retail:number}>={
 water:{name:'Вода',venue:'shop',retail:9000},hotdog:{name:'Хот-дог',venue:'shop',retail:15000},chocolate:{name:'Шоколадка',venue:'shop',retail:9000},snacks:{name:'Снеки',venue:'shop',retail:12000},
 coffee:{name:'Кофе, сырьё',venue:'cafe',retail:0},milk:{name:'Молоко, сырьё',venue:'cafe',retail:0},cake:{name:'Пирожное',venue:'cafe',retail:17000},pie:{name:'Пирожок',venue:'cafe',retail:13000},
 espresso:{name:'Эспрессо',venue:'cafe',retail:12000},americano:{name:'Американо',venue:'cafe',retail:14000},cappuccino:{name:'Капучино',venue:'cafe',retail:19000},latte:{name:'Латте',venue:'cafe',retail:22000},
};
export const VENUES={shop:{name:'Магазин',open:1_500_000,upgrades:[0,1_000_000,2_000_000],capacity:[0,500,900,1400],maintenance:[0,30000,50000,80000],salary:25000,service:120,patience:[300,900]},
 cafe:{name:'Кафе',open:2_000_000,upgrades:[0,1_400_000,2_800_000],capacity:[0,650,1100,1700],maintenance:[0,50000,80000,120000],salary:35000,service:480,patience:[600,1800]}} as const;
export const STAFF_SPEED=[1,.85,.72,.61,.52];
export const TRAIN_COST=[0,250000,400000,600000,850000];
export const SUPPLIERS={standard:{name:'Стандартный',price:1,eta:7200},express:{name:'Срочный',price:1.25,eta:1800},budget:{name:'Экономный',price:.86,eta:18000}} as const;
export interface Stock {quantity:number;valueKopeks:number}
export interface CommerceOrder {id:string;placed:number;arrival:number;supplier:Supplier;lines:Partial<Record<Sku,{quantity:number;costKopeks:number}>>;totalKopeks:number;status:'enroute'|'delivered'}
export interface VenueState {level:number;staffLevel:number;queue:number[];serving?:number;serviceRemaining:number;salaryDay:number;maintenanceDay:number;revenueKopeks:number;costKopeks:number;lost:number}
export interface CommerceState {venues:Record<Venue,VenueState>;stock:Record<Sku,Stock>;prices:Record<Product,number>;orders:CommerceOrder[];nextOrder:number;parking:(number|null)[];customers:Record<number,{plan:Venue[];current?:Venue;patience:number;waiting:boolean;product?:Product}>;}
export function createCommerce():CommerceState {return {venues:{shop:{level:0,staffLevel:0,queue:[],serviceRemaining:0,salaryDay:0,maintenanceDay:0,revenueKopeks:0,costKopeks:0,lost:0},cafe:{level:0,staffLevel:0,queue:[],serviceRemaining:0,salaryDay:0,maintenanceDay:0,revenueKopeks:0,costKopeks:0,lost:0}},stock:Object.fromEntries(Object.keys(SKU).map(k=>[k,{quantity:0,valueKopeks:0}])) as Record<Sku,Stock>,prices:Object.fromEntries(Object.entries(PRODUCTS).map(([k,p])=>[k,p.retail])) as Record<Product,number>,orders:[],nextOrder:1,parking:Array(4).fill(null),customers:{}};}
export function retailMarketPrice(product:Product,seconds:number):number {const base=PRODUCTS[product].retail;return base?Math.max(100,Math.round(base*(1+.045*Math.sin(seconds/86400*.17+Object.keys(PRODUCTS).indexOf(product)*.8))/100)*100):0;}
export function buyPrice(sku:Sku,seconds:number,supplier:Supplier):number {const wave=Math.sin(seconds/86400*.27+Object.keys(SKU).indexOf(sku)*1.7)*.07;return Math.max(1,Math.round(SKU[sku].buy*(1+wave)*SUPPLIERS[supplier].price));}
export function usedSpace(state:CommerceState,venue:Venue,includeOrders=true):number {let used=(Object.keys(SKU) as Sku[]).filter(s=>SKU[s].venue===venue).reduce((n,s)=>n+state.stock[s].quantity*SKU[s].size,0);if(includeOrders)for(const order of state.orders.filter(o=>o.status==='enroute'))for(const [s,line] of Object.entries(order.lines) as [Sku,{quantity:number}][])if(SKU[s].venue===venue)used+=line.quantity*SKU[s].size;return used;}
export function addStock(stock:Stock,quantity:number,costKopeks:number):void {stock.quantity+=quantity;stock.valueKopeks+=costKopeks;}
export function consume(stock:Stock,quantity:number):number {if(stock.quantity<quantity)return -1;const cost=quantity===stock.quantity?stock.valueKopeks:Math.round(stock.valueKopeks*quantity/stock.quantity);stock.quantity-=quantity;stock.valueKopeks-=cost;return cost;}
