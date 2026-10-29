/** Synthetic documented Magnite banner request. Not original publisher bytes. */
export const magniteAuctionUrl="https://fastlane.rubiconproject.com/a/api/prebid-exchange.json?as=123-456&m=banner&s=1";
export function magniteAuctionBody(){return {
 id:"auction-fixture",site:{page:"https://publisher.test/"},ext:{prebid:{channel:{name:"pbjs"}}},
 imp:[{id:"banner-fixture",banner:{format:[{w:300,h:250}]},ext:{prebid:{bidder:{dvplus:{accountId:123,siteId:456,zoneId:789}}}}}],
 user:{ext:{eids:[{source:"pubcid.org",uids:[{id:"synthetic-private-visitor",atype:1}]}]}},
};}
