/** Exact small predicate excerpts from reviewed retained OneTrust SDK bodies.
 * Full received-byte hashes bind each excerpt review to its source revision.
 * Review receipts: artifacts/daily-scan-audit/runs/20261028T185456Z-manual-onetrust-source-coverage.
 * These are independent test references, never executed in production. */
export const reviewedOneTrustPredicates = [
{
  "version": "202602.1.0",
  "sdkSha256": "b7171dca698ca454704426d1ff6c7514c6e0d6c415931b37da63d4c7b77ed8c6",
  "sdkBytes": 543890,
  "methods": {
    "isValidConsentNoticeGroup": "function(e,t){var o,n,r,i,s,a;return!!e.ShowInPopup&&(o=this.isGroupHasCookies(e),s=i=r=n=!1,null!=(a=e)&&a.Parent||(e.SubGroups.length&&(n=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&e.FirstPartyCookies.length}),r=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&(e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length)}),i=e.SubGroups.some(function(e){return e.GroupName&&e.AlwaysShowCategory}),!t||e.FirstPartyCookies.length&&e.Hosts.length||(s=!e.SubGroups.some(function(e){return-1===Lt.indexOf(e.Type)}))),a=e.SubGroups.some(function(e){return-1<Lt.indexOf(e.Type)}),(-1<Lt.indexOf(e.Type)||a)&&(e.ShowVendorList=!0),(e.Hosts.length||r||n)&&(e.ShowHostList=!0)),this.isValidGroup(o,e,n,r,s,i))}",
    "isValidGroup": "function(e,t,o,n,r,i){var s=l.showVendorService&&t.VendorServices&&t.VendorServices.length;return!!t.AlwaysShowCategory||e||-1<Lt.indexOf(t.Type)||o||n||i||r||s}",
    "isGroupHasCookies": "function(e){return e.FirstPartyCookies.length||e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length||e.VendorServices&&e.VendorServices.length}",
    "shouldShowGroupWithNoTrackingTech": null
  },
  "iabTypeArrays": {
    "Lt": [
      "IAB2_PURPOSE",
      "IAB2_STACK",
      "IAB2_FEATURE",
      "IAB2_SPL_PURPOSE",
      "IAB2_SPL_FEATURE",
      "IAB2V2_PURPOSE",
      "IAB2V2_SPL_PURPOSE",
      "IAB2V2_FEATURE",
      "IAB2V2_SPL_FEATURE",
      "IAB2V2_STACK"
    ]
  }
},
  {
  "version": "202411.2.0",
  "sdkSha256": "de1a8047684fd201c0d9a0a1d7e4c02221f7e34e8433fdd0940f30b1ecf4c957",
  "sdkBytes": 474797,
  "methods": {
    "isValidConsentNoticeGroup": "function(e,t){var o,n,r,i,s;return!!e.ShowInPopup&&(o=this.isGroupHasCookies(e),i=r=n=!1,null!=(s=e)&&s.Parent||(e.SubGroups.length&&(n=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&e.FirstPartyCookies.length}),r=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&(e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length)}),!t||e.FirstPartyCookies.length&&e.Hosts.length||(i=!e.SubGroups.some(function(e){return-1===vt.indexOf(e.Type)}))),s=e.SubGroups.some(function(e){return-1<vt.indexOf(e.Type)}),(-1<vt.indexOf(e.Type)||s)&&(e.ShowVendorList=!0),(e.Hosts.length||r||n)&&(e.ShowHostList=!0)),this.isValidGroup(o,e,n,r,i))}",
    "isValidGroup": "function(e,t,o,n,r){var i=L.showVendorService&&t.VendorServices&&t.VendorServices.length;return e||-1<vt.indexOf(t.Type)||o||n||r||i}",
    "isGroupHasCookies": "function(e){return e.FirstPartyCookies.length||e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length||e.VendorServices&&e.VendorServices.length}",
    "shouldShowGroupWithNoTrackingTech": null
  },
  "iabTypeArrays": {
    "vt": [
      "IAB2_PURPOSE",
      "IAB2_STACK",
      "IAB2_FEATURE",
      "IAB2_SPL_PURPOSE",
      "IAB2_SPL_FEATURE",
      "IAB2V2_PURPOSE",
      "IAB2V2_SPL_PURPOSE",
      "IAB2V2_FEATURE",
      "IAB2V2_SPL_FEATURE",
      "IAB2V2_STACK"
    ]
  }
},
  {
    "version": "202609.2.0",
    "sdkSha256": "fdfc3d5184a8b3ffc2baf79a230c91958aee88c84fb370a52ca3802b3ee34059",
    "sdkBytes": 615081,
    "methods": {
      "isValidConsentNoticeGroup": "function(e,t){var o,n,r,i,s,a;return!!e.ShowInPopup&&(o=this.isGroupHasCookies(e),s=i=r=n=!1,null!=(a=e)&&a.Parent||(e.SubGroups.length&&(n=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&e.FirstPartyCookies.length}),r=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&(e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length)}),i=e.SubGroups.some(function(e){return e.GroupName&&e.AlwaysShowCategory}),!t||e.FirstPartyCookies.length&&e.Hosts.length||(s=!e.SubGroups.some(function(e){return-1===Bt.indexOf(e.Type)}))),a=e.SubGroups.some(function(e){return-1<Bt.indexOf(e.Type)}),(-1<Bt.indexOf(e.Type)||a)&&(e.ShowVendorList=!0),(e.Hosts.length||r||n)&&(e.ShowHostList=!0)),this.isValidGroup(o,e,n,r,s,i))}",
      "isValidGroup": "function(e,t,o,n,r,i){var s=p.showVendorService&&t.VendorServices&&t.VendorServices.length;return!!t.AlwaysShowCategory||e||-1<Bt.indexOf(t.Type)||o||n||i||r||s}",
      "isGroupHasCookies": "function(e){return e.FirstPartyCookies.length||e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length||e.VendorServices&&e.VendorServices.length}",
      "shouldShowGroupWithNoTrackingTech": null
    },
    "iabTypeArrays": {
      "Bt": [
        "IAB2_PURPOSE",
        "IAB2_STACK",
        "IAB2_FEATURE",
        "IAB2_SPL_PURPOSE",
        "IAB2_SPL_FEATURE",
        "IAB2V2_PURPOSE",
        "IAB2V2_SPL_PURPOSE",
        "IAB2V2_FEATURE",
        "IAB2V2_SPL_FEATURE",
        "IAB2V2_STACK"
      ]
    }
  },
  {
    "version": "202409.2.0",
    "sdkSha256": "d20357455b511ce933ce8d435007781a67ad2c01453af9b88f79e57e14476add",
    "sdkBytes": 472088,
    "methods": {
      "isValidConsentNoticeGroup": "function(e,t){var o,n,r,i,s;return!!e.ShowInPopup&&(o=this.isGroupHasCookies(e),i=r=n=!1,null!=(s=e)&&s.Parent||(e.SubGroups.length&&(n=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&e.FirstPartyCookies.length}),r=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&(e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length)}),!t||e.FirstPartyCookies.length&&e.Hosts.length||(i=!e.SubGroups.some(function(e){return-1===vt.indexOf(e.Type)}))),s=e.SubGroups.some(function(e){return-1<vt.indexOf(e.Type)}),(-1<vt.indexOf(e.Type)||s)&&(e.ShowVendorList=!0),(e.Hosts.length||r||n)&&(e.ShowHostList=!0)),this.isValidGroup(o,e,n,r,i))}",
      "isValidGroup": "function(e,t,o,n,r){var i=L.showVendorService&&t.VendorServices&&t.VendorServices.length;return e||-1<vt.indexOf(t.Type)||o||n||r||i}",
      "isGroupHasCookies": "function(e){return e.FirstPartyCookies.length||e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length||e.VendorServices&&e.VendorServices.length}",
      "shouldShowGroupWithNoTrackingTech": null
    },
    "iabTypeArrays": {
      "vt": [
        "IAB2_PURPOSE",
        "IAB2_STACK",
        "IAB2_FEATURE",
        "IAB2_SPL_PURPOSE",
        "IAB2_SPL_FEATURE",
        "IAB2V2_PURPOSE",
        "IAB2V2_SPL_PURPOSE",
        "IAB2V2_FEATURE",
        "IAB2V2_SPL_FEATURE",
        "IAB2V2_STACK"
      ]
    }
  },
  {
    "version": "6.34.0",
    "sdkSha256": "e88dafe889a514ea8b9b07747f53d08b66a473b7caa78645b4aa2167563651e7",
    "sdkBytes": 356817,
    "methods": {
      "isValidConsentNoticeGroup": "function(e,t){if(!e.ShowInPopup)return!1;var o=e.FirstPartyCookies.length||e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length,n=!1,r=!1,i=!1;if(e&&!e.Parent){e.SubGroups.length&&(n=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&e.FirstPartyCookies.length}),r=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&(e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length)}),!t||e.FirstPartyCookies.length&&e.Hosts.length||(i=!e.SubGroups.some(function(e){return-1===kt.indexOf(e.Type)})));var s=e.SubGroups.some(function(e){return-1<kt.indexOf(e.Type)});(-1<kt.indexOf(e.Type)||s)&&(e.ShowVendorList=!0),(e.Hosts.length||r||n)&&(e.ShowHostList=!0)}return o||-1<kt.indexOf(e.Type)||n||r||i}",
      "isValidGroup": null,
      "isGroupHasCookies": null,
      "shouldShowGroupWithNoTrackingTech": null
    },
    "iabTypeArrays": {
      "kt": [
        "IAB2_PURPOSE",
        "IAB2_STACK",
        "IAB2_FEATURE",
        "IAB2_SPL_PURPOSE",
        "IAB2_SPL_FEATURE"
      ]
    }
  },
  {
    "version": "6.36.0",
    "sdkSha256": "00bab1a0ca70bae23e6e733c1b78045476a2d2688aa0c5cf26fc7efa81ccaa0b",
    "sdkBytes": 370595,
    "methods": {
      "isValidConsentNoticeGroup": "function(e,t){if(!e.ShowInPopup)return!1;var o=e.FirstPartyCookies.length||e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length||e.VendorServices&&e.VendorServices.length,n=!1,r=!1,i=!1;if(e&&!e.Parent){e.SubGroups.length&&(n=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&e.FirstPartyCookies.length}),r=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&(e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length)}),!t||e.FirstPartyCookies.length&&e.Hosts.length||(i=!e.SubGroups.some(function(e){return-1===Tt.indexOf(e.Type)})));var s=e.SubGroups.some(function(e){return-1<Tt.indexOf(e.Type)});(-1<Tt.indexOf(e.Type)||s)&&(e.ShowVendorList=!0),(e.Hosts.length||r||n)&&(e.ShowHostList=!0)}return o||-1<Tt.indexOf(e.Type)||n||r||i}",
      "isValidGroup": null,
      "isGroupHasCookies": null,
      "shouldShowGroupWithNoTrackingTech": null
    },
    "iabTypeArrays": {
      "Tt": [
        "IAB2_PURPOSE",
        "IAB2_STACK",
        "IAB2_FEATURE",
        "IAB2_SPL_PURPOSE",
        "IAB2_SPL_FEATURE"
      ]
    }
  },
  {
    "version": "202609.1.0",
    "sdkSha256": "84e6cbb4db5f6050eadc809086f969d41d3f779091b2a98686b2887f8c3946a0",
    "sdkBytes": 606369,
    "methods": {
      "isValidConsentNoticeGroup": "function(e,t){var o,n,r,i,s,a;return!!e.ShowInPopup&&(o=this.isGroupHasCookies(e),s=i=r=n=!1,null!=(a=e)&&a.Parent||(e.SubGroups.length&&(n=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&e.FirstPartyCookies.length}),r=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&(e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length)}),i=e.SubGroups.some(function(e){return e.GroupName&&e.AlwaysShowCategory}),!t||e.FirstPartyCookies.length&&e.Hosts.length||(s=!e.SubGroups.some(function(e){return-1===wt.indexOf(e.Type)}))),a=e.SubGroups.some(function(e){return-1<wt.indexOf(e.Type)}),(-1<wt.indexOf(e.Type)||a)&&(e.ShowVendorList=!0),(e.Hosts.length||r||n)&&(e.ShowHostList=!0)),this.isValidGroup(o,e,n,r,s,i))}",
      "isValidGroup": "function(e,t,o,n,r,i){var s=p.showVendorService&&t.VendorServices&&t.VendorServices.length;return!!t.AlwaysShowCategory||e||-1<wt.indexOf(t.Type)||o||n||i||r||s}",
      "isGroupHasCookies": "function(e){return e.FirstPartyCookies.length||e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length||e.VendorServices&&e.VendorServices.length}",
      "shouldShowGroupWithNoTrackingTech": null
    },
    "iabTypeArrays": {
      "wt": [
        "IAB2_PURPOSE",
        "IAB2_STACK",
        "IAB2_FEATURE",
        "IAB2_SPL_PURPOSE",
        "IAB2_SPL_FEATURE",
        "IAB2V2_PURPOSE",
        "IAB2V2_SPL_PURPOSE",
        "IAB2V2_FEATURE",
        "IAB2V2_SPL_FEATURE",
        "IAB2V2_STACK"
      ]
    }
  },
  {
    "version": "202511.1.0",
    "sdkSha256": "d82ebde730f1c2caa2a648f84319b2a9f9e2fb411f0d9ded2cb552ffd7d7f7af",
    "sdkBytes": 525881,
    "methods": {
      "isValidConsentNoticeGroup": "function(e,t){var o,n,r,i,s,a;return!!e.ShowInPopup&&(o=this.isGroupHasCookies(e),s=i=r=n=!1,null!=(a=e)&&a.Parent||(e.SubGroups.length&&(n=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&e.FirstPartyCookies.length}),r=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&(e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length)}),i=e.SubGroups.some(function(e){return e.GroupName&&e.AlwaysShowCategory}),!t||e.FirstPartyCookies.length&&e.Hosts.length||(s=!e.SubGroups.some(function(e){return-1===_t.indexOf(e.Type)}))),a=e.SubGroups.some(function(e){return-1<_t.indexOf(e.Type)}),(-1<_t.indexOf(e.Type)||a)&&(e.ShowVendorList=!0),(e.Hosts.length||r||n)&&(e.ShowHostList=!0)),this.isValidGroup(o,e,n,r,s,i))}",
      "isValidGroup": "function(e,t,o,n,r,i){var s=l.showVendorService&&t.VendorServices&&t.VendorServices.length;return!!t.AlwaysShowCategory||e||-1<_t.indexOf(t.Type)||o||n||i||r||s}",
      "isGroupHasCookies": "function(e){return e.FirstPartyCookies.length||e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length||e.VendorServices&&e.VendorServices.length}",
      "shouldShowGroupWithNoTrackingTech": null
    },
    "iabTypeArrays": {
      "_t": [
        "IAB2_PURPOSE",
        "IAB2_STACK",
        "IAB2_FEATURE",
        "IAB2_SPL_PURPOSE",
        "IAB2_SPL_FEATURE",
        "IAB2V2_PURPOSE",
        "IAB2V2_SPL_PURPOSE",
        "IAB2V2_FEATURE",
        "IAB2V2_SPL_FEATURE",
        "IAB2V2_STACK"
      ]
    }
  },
  {
    "version": "202411.1.0",
    "sdkSha256": "0c5e5da9ad3458d5cbdf9c3262174f7689b8e42a1c7acf3675f7b2feb19afcf7",
    "sdkBytes": 472974,
    "methods": {
      "isValidConsentNoticeGroup": "function(e,t){var o,n,r,i,s;return!!e.ShowInPopup&&(o=this.isGroupHasCookies(e),i=r=n=!1,null!=(s=e)&&s.Parent||(e.SubGroups.length&&(n=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&e.FirstPartyCookies.length}),r=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&(e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length)}),!t||e.FirstPartyCookies.length&&e.Hosts.length||(i=!e.SubGroups.some(function(e){return-1===vt.indexOf(e.Type)}))),s=e.SubGroups.some(function(e){return-1<vt.indexOf(e.Type)}),(-1<vt.indexOf(e.Type)||s)&&(e.ShowVendorList=!0),(e.Hosts.length||r||n)&&(e.ShowHostList=!0)),this.isValidGroup(o,e,n,r,i))}",
      "isValidGroup": "function(e,t,o,n,r){var i=L.showVendorService&&t.VendorServices&&t.VendorServices.length;return e||-1<vt.indexOf(t.Type)||o||n||r||i}",
      "isGroupHasCookies": "function(e){return e.FirstPartyCookies.length||e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length||e.VendorServices&&e.VendorServices.length}",
      "shouldShowGroupWithNoTrackingTech": null
    },
    "iabTypeArrays": {
      "vt": [
        "IAB2_PURPOSE",
        "IAB2_STACK",
        "IAB2_FEATURE",
        "IAB2_SPL_PURPOSE",
        "IAB2_SPL_FEATURE",
        "IAB2V2_PURPOSE",
        "IAB2V2_SPL_PURPOSE",
        "IAB2V2_FEATURE",
        "IAB2V2_SPL_FEATURE",
        "IAB2V2_STACK"
      ]
    }
  },
  {
    "version": "202502.1.0",
    "sdkSha256": "d7f711dcac78c2cfccb1b713b341f3da3d7717d891b50b7807c65f5553db2867",
    "sdkBytes": 488612,
    "methods": {
      "isValidConsentNoticeGroup": "function(e,t){var o,n,r,i,s;return!!e.ShowInPopup&&(o=this.isGroupHasCookies(e),i=r=n=!1,null!=(s=e)&&s.Parent||(e.SubGroups.length&&(n=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&e.FirstPartyCookies.length}),r=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&(e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length)}),!t||e.FirstPartyCookies.length&&e.Hosts.length||(i=!e.SubGroups.some(function(e){return-1===vt.indexOf(e.Type)}))),s=e.SubGroups.some(function(e){return-1<vt.indexOf(e.Type)}),(-1<vt.indexOf(e.Type)||s)&&(e.ShowVendorList=!0),(e.Hosts.length||r||n)&&(e.ShowHostList=!0)),this.isValidGroup(o,e,n,r,i))}",
      "isValidGroup": "function(e,t,o,n,r){var i=L.showVendorService&&t.VendorServices&&t.VendorServices.length;return e||-1<vt.indexOf(t.Type)||o||n||r||i}",
      "isGroupHasCookies": "function(e){return e.FirstPartyCookies.length||e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length||e.VendorServices&&e.VendorServices.length}",
      "shouldShowGroupWithNoTrackingTech": null
    },
    "iabTypeArrays": {
      "vt": [
        "IAB2_PURPOSE",
        "IAB2_STACK",
        "IAB2_FEATURE",
        "IAB2_SPL_PURPOSE",
        "IAB2_SPL_FEATURE",
        "IAB2V2_PURPOSE",
        "IAB2V2_SPL_PURPOSE",
        "IAB2V2_FEATURE",
        "IAB2V2_SPL_FEATURE",
        "IAB2V2_STACK"
      ]
    }
  },
  {
    "version": "202505.1.0",
    "sdkSha256": "ea84193c3562ce2927329b92fcc12c77ee02e441dcc5f616132f48bf5fbc1bc8",
    "sdkBytes": 504085,
    "methods": {
      "isValidConsentNoticeGroup": "function(e,t){var o,n,r,i,s;return!!e.ShowInPopup&&(o=this.isGroupHasCookies(e),i=r=n=!1,null!=(s=e)&&s.Parent||(e.SubGroups.length&&(n=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&e.FirstPartyCookies.length}),r=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&(e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length)}),!t||e.FirstPartyCookies.length&&e.Hosts.length||(i=!e.SubGroups.some(function(e){return-1===Tt.indexOf(e.Type)}))),s=e.SubGroups.some(function(e){return-1<Tt.indexOf(e.Type)}),(-1<Tt.indexOf(e.Type)||s)&&(e.ShowVendorList=!0),(e.Hosts.length||r||n)&&(e.ShowHostList=!0)),this.isValidGroup(o,e,n,r,i))}",
      "isValidGroup": "function(e,t,o,n,r){var i=l.showVendorService&&t.VendorServices&&t.VendorServices.length;return!!this.shouldShowGroupWithNoTrackingTech(t)||e||-1<Tt.indexOf(t.Type)||o||n||r||i}",
      "isGroupHasCookies": "function(e){return e.FirstPartyCookies.length||e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length||e.VendorServices&&e.VendorServices.length}",
      "shouldShowGroupWithNoTrackingTech": "function(e){return S.fp.CookieV2SkipCategory&&e.AlwaysShowCategory}"
    },
    "iabTypeArrays": {
      "Tt": [
        "IAB2_PURPOSE",
        "IAB2_STACK",
        "IAB2_FEATURE",
        "IAB2_SPL_PURPOSE",
        "IAB2_SPL_FEATURE",
        "IAB2V2_PURPOSE",
        "IAB2V2_SPL_PURPOSE",
        "IAB2V2_FEATURE",
        "IAB2V2_SPL_FEATURE",
        "IAB2V2_STACK"
      ]
    }
  },
  {
    "version": "202512.1.0",
    "sdkSha256": "8334dddfc6e7e5838810a2e96eb7df90b737babc4a6331622827b3c3e534ab2f",
    "sdkBytes": 531687,
    "methods": {
      "isValidConsentNoticeGroup": "function(e,t){var o,n,r,i,s,a;return!!e.ShowInPopup&&(o=this.isGroupHasCookies(e),s=i=r=n=!1,null!=(a=e)&&a.Parent||(e.SubGroups.length&&(n=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&e.FirstPartyCookies.length}),r=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&(e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length)}),i=e.SubGroups.some(function(e){return e.GroupName&&e.AlwaysShowCategory}),!t||e.FirstPartyCookies.length&&e.Hosts.length||(s=!e.SubGroups.some(function(e){return-1===_t.indexOf(e.Type)}))),a=e.SubGroups.some(function(e){return-1<_t.indexOf(e.Type)}),(-1<_t.indexOf(e.Type)||a)&&(e.ShowVendorList=!0),(e.Hosts.length||r||n)&&(e.ShowHostList=!0)),this.isValidGroup(o,e,n,r,s,i))}",
      "isValidGroup": "function(e,t,o,n,r,i){var s=l.showVendorService&&t.VendorServices&&t.VendorServices.length;return!!t.AlwaysShowCategory||e||-1<_t.indexOf(t.Type)||o||n||i||r||s}",
      "isGroupHasCookies": "function(e){return e.FirstPartyCookies.length||e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length||e.VendorServices&&e.VendorServices.length}",
      "shouldShowGroupWithNoTrackingTech": null
    },
    "iabTypeArrays": {
      "_t": [
        "IAB2_PURPOSE",
        "IAB2_STACK",
        "IAB2_FEATURE",
        "IAB2_SPL_PURPOSE",
        "IAB2_SPL_FEATURE",
        "IAB2V2_PURPOSE",
        "IAB2V2_SPL_PURPOSE",
        "IAB2V2_FEATURE",
        "IAB2V2_SPL_FEATURE",
        "IAB2V2_STACK"
      ]
    }
  },
  {
    "version": "202508.2.0",
    "sdkSha256": "69d65ec22a3d484d852e795b79517d6757749efdec5c6842b4968a3333afd2c9",
    "sdkBytes": 511534,
    "methods": {
      "isValidConsentNoticeGroup": "function(e,t){var o,n,r,i,s;return!!e.ShowInPopup&&(o=this.isGroupHasCookies(e),i=r=n=!1,null!=(s=e)&&s.Parent||(e.SubGroups.length&&(n=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&e.FirstPartyCookies.length}),r=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&(e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length)}),!t||e.FirstPartyCookies.length&&e.Hosts.length||(i=!e.SubGroups.some(function(e){return-1===Lt.indexOf(e.Type)}))),s=e.SubGroups.some(function(e){return-1<Lt.indexOf(e.Type)}),(-1<Lt.indexOf(e.Type)||s)&&(e.ShowVendorList=!0),(e.Hosts.length||r||n)&&(e.ShowHostList=!0)),this.isValidGroup(o,e,n,r,i))}",
      "isValidGroup": "function(e,t,o,n,r){var i=l.showVendorService&&t.VendorServices&&t.VendorServices.length;return!!t.AlwaysShowCategory||e||-1<Lt.indexOf(t.Type)||o||n||r||i}",
      "isGroupHasCookies": "function(e){return e.FirstPartyCookies.length||e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length||e.VendorServices&&e.VendorServices.length}",
      "shouldShowGroupWithNoTrackingTech": null
    },
    "iabTypeArrays": {
      "Lt": [
        "IAB2_PURPOSE",
        "IAB2_STACK",
        "IAB2_FEATURE",
        "IAB2_SPL_PURPOSE",
        "IAB2_SPL_FEATURE",
        "IAB2V2_PURPOSE",
        "IAB2V2_SPL_PURPOSE",
        "IAB2V2_FEATURE",
        "IAB2V2_SPL_FEATURE",
        "IAB2V2_STACK"
      ]
    }
  },
  {
    "version": "202604.2.0",
    "sdkSha256": "6360568655a50bd856b4678504da3f2e472c9d049d26edd14695c65b0934efbb",
    "sdkBytes": 566048,
    "methods": {
      "isValidConsentNoticeGroup": "function(e,t){var o,n,r,i,s,a;return!!e.ShowInPopup&&(o=this.isGroupHasCookies(e),s=i=r=n=!1,null!=(a=e)&&a.Parent||(e.SubGroups.length&&(n=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&e.FirstPartyCookies.length}),r=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&(e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length)}),i=e.SubGroups.some(function(e){return e.GroupName&&e.AlwaysShowCategory}),!t||e.FirstPartyCookies.length&&e.Hosts.length||(s=!e.SubGroups.some(function(e){return-1===Dt.indexOf(e.Type)}))),a=e.SubGroups.some(function(e){return-1<Dt.indexOf(e.Type)}),(-1<Dt.indexOf(e.Type)||a)&&(e.ShowVendorList=!0),(e.Hosts.length||r||n)&&(e.ShowHostList=!0)),this.isValidGroup(o,e,n,r,s,i))}",
      "isValidGroup": "function(e,t,o,n,r,i){var s=p.showVendorService&&t.VendorServices&&t.VendorServices.length;return!!t.AlwaysShowCategory||e||-1<Dt.indexOf(t.Type)||o||n||i||r||s}",
      "isGroupHasCookies": "function(e){return e.FirstPartyCookies.length||e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length||e.VendorServices&&e.VendorServices.length}",
      "shouldShowGroupWithNoTrackingTech": null
    },
    "iabTypeArrays": {
      "Dt": [
        "IAB2_PURPOSE",
        "IAB2_STACK",
        "IAB2_FEATURE",
        "IAB2_SPL_PURPOSE",
        "IAB2_SPL_FEATURE",
        "IAB2V2_PURPOSE",
        "IAB2V2_SPL_PURPOSE",
        "IAB2V2_FEATURE",
        "IAB2V2_SPL_FEATURE",
        "IAB2V2_STACK"
      ]
    }
  },
  {
    "version": "202211.2.0",
    "sdkSha256": "49582965b8ddcb8f728f5b4d33b2c73e138690f5c6815bd9918de94f62f4b80b",
    "sdkBytes": 392535,
    "methods": {
      "isValidConsentNoticeGroup": "function(e,t){if(!e.ShowInPopup)return!1;var o=e.FirstPartyCookies.length||e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length||e.VendorServices&&e.VendorServices.length,n=!1,r=!1,i=!1;if(e&&!e.Parent){e.SubGroups.length&&(n=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&e.FirstPartyCookies.length}),r=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&(e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length)}),!t||e.FirstPartyCookies.length&&e.Hosts.length||(i=!e.SubGroups.some(function(e){return-1===Lt.indexOf(e.Type)})));var s=e.SubGroups.some(function(e){return-1<Lt.indexOf(e.Type)});(-1<Lt.indexOf(e.Type)||s)&&(e.ShowVendorList=!0),(e.Hosts.length||r||n)&&(e.ShowHostList=!0)}return o||-1<Lt.indexOf(e.Type)||n||r||i}",
      "isValidGroup": null,
      "isGroupHasCookies": null,
      "shouldShowGroupWithNoTrackingTech": null
    },
    "iabTypeArrays": {
      "Lt": [
        "IAB2_PURPOSE",
        "IAB2_STACK",
        "IAB2_FEATURE",
        "IAB2_SPL_PURPOSE",
        "IAB2_SPL_FEATURE"
      ]
    }
  },
  {
    "version": "202608.1.0",
    "sdkSha256": "3d2f7f7ae2fdfbf24acada1eaeaa636b84db784d2587115af8c7288565c65208",
    "sdkBytes": 604329,
    "methods": {
      "isValidConsentNoticeGroup": "function(e,t){var o,n,r,i,s,a;return!!e.ShowInPopup&&(o=this.isGroupHasCookies(e),s=i=r=n=!1,null!=(a=e)&&a.Parent||(e.SubGroups.length&&(n=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&e.FirstPartyCookies.length}),r=e.SubGroups.some(function(e){return e.GroupName&&e.ShowInPopup&&(e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length)}),i=e.SubGroups.some(function(e){return e.GroupName&&e.AlwaysShowCategory}),!t||e.FirstPartyCookies.length&&e.Hosts.length||(s=!e.SubGroups.some(function(e){return-1===wt.indexOf(e.Type)}))),a=e.SubGroups.some(function(e){return-1<wt.indexOf(e.Type)}),(-1<wt.indexOf(e.Type)||a)&&(e.ShowVendorList=!0),(e.Hosts.length||r||n)&&(e.ShowHostList=!0)),this.isValidGroup(o,e,n,r,s,i))}",
      "isValidGroup": "function(e,t,o,n,r,i){var s=p.showVendorService&&t.VendorServices&&t.VendorServices.length;return!!t.AlwaysShowCategory||e||-1<wt.indexOf(t.Type)||o||n||i||r||s}",
      "isGroupHasCookies": "function(e){return e.FirstPartyCookies.length||e.Hosts.length||e.GeneralVendorsIds&&e.GeneralVendorsIds.length||e.VendorServices&&e.VendorServices.length}",
      "shouldShowGroupWithNoTrackingTech": null
    },
    "iabTypeArrays": {
      "wt": [
        "IAB2_PURPOSE",
        "IAB2_STACK",
        "IAB2_FEATURE",
        "IAB2_SPL_PURPOSE",
        "IAB2_SPL_FEATURE",
        "IAB2V2_PURPOSE",
        "IAB2V2_SPL_PURPOSE",
        "IAB2V2_FEATURE",
        "IAB2V2_SPL_FEATURE",
        "IAB2V2_STACK"
      ]
    }
  }
] as const;
