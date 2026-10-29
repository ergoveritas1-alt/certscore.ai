/** Synthetic protocol fixture. Never a replay or claim about a publisher's
 * original request, ownership, GPC response or legal processing purpose. */
export const indexAuctionUrl="https://htlb.casalemedia.com/openrtb/pbjs?s=12345";
export function indexAuctionBody(){return {
 id:"auction-fixture",ext:{source:"prebid"},site:{page:"https://publisher.test/"},
 imp:[{id:"banner-fixture",banner:{format:[{w:300,h:250,ext:{siteID:"12345"}}]}}],
 user:{eids:[{source:"pubcid.org",uids:[{id:"synthetic-private-visitor",atype:1}]}]},
};}
