import type { GitHubApp } from "./GitHubApp";

const testPrivateKey = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC2tE+niyzoQ2ja
mVrYZBzKnB5hN/gI44lKTrdyY71y8ks+XC4fV7sWxy0Q1DtLmoo5j74sYDIGFE0x
2JDmkYEW6wuazDEiUAs0PIftqYsi6lB9WhLOINZ4o6tYOwM2laJR6s6cMCZog3PR
QghocV06PkQPnNdEbhOhBi456+tJ1W2jAxyTVgc71C3YMaa/qhLdiT8ymL7Yy1oL
oHcUGiMF791LleLD36VTENUAW+w7fjLXAMy7101FnyIdnKrudXoOgVGcK0J8cMrs
mgTqVxTodPUcnw1hoqx7GyZKpcG0tQRxiPnsmPXGPh2PfmhSe+hyTzaPdXnSq8Vt
Tata4zwvAgMBAAECggEAHE8pXcyIKMpJH5X40uQFkgn0AHGrp7TvO5RMLcKb7Yjy
ymF+GV0pSrOR8rRFJnHLo8pMrT46ggv4lMCkXcAt6wnVwnvhIRqbTHy/Pb6yJbbT
bJjdpmga00EzoM2EB0Z9it6Bz7GmQeDHEVAp/Vo+F8g4w4ffKGXl+g1QcakcdqlX
uRvWh3TG9bSKktkR1GZYyfZEJ9ZxKsYkL1pdkXnjGy3lNeI7pB4RUYr1bYXGoAGm
xNK4GDnAZeB6CpAfpb0eTrApKRAFUlu1/zJ6Z2DTuHfnM+2sTCcNcW/43ffc+o6W
2f+BJRDx6rhNpwDTrr8cpK7emopux4Z9MRBAHXsAAQKBgQD2uZwVC30pycunevH1
c6ouRQcshPWjUMTB+bochnmPvGiBzB+Og5k0I/nIe5CyjrFPvJ2Iv+qByT6DKuBQ
0WFf+/pz3/LIyWGe+L1QrpCz/RUhKhGDNOklvkmR/BUICpW0gufqfJggNmzoWO2f
uAdsNmbKwZ7PaihkTLEdBa62LwKBgQC9kpcJ3iZ8GwVKewF0/a0BftnrMlhCOS+g
8JeByLvBAhvI2Rb2gtqbi/T9pkJhmLFJqZxaBwnBAgCfegJHi65aUALE5c3k7v/m
+MH5f2QU/NRF71ZocrDQVrLu2KGGYGs+PJYoVKgNmpWz4tbVYx/C3GykCZO92szw
796LB1haAQKBgQCy70YdlSl/JxUGMApPA0XHLNTZGsyzVx57t8ucaIK9Fd2NVScF
yrdPs0+ycLsuZIJ/28E8rkM7QWKO6oeo1VGTtUGczCxeJn8gNjHG0/OqNcAfP01Y
JQV6FBlzQKlYHaUZN19PFnGV2yL9F5Gupl7rwkCmh+nPb6Q/qcdBzx84jQKBgQCW
6berd1oTuj8AB+QlCj1Lz3wTrERuk6/C40T5YJ93CwKrZYbOP2VgJo6lzlFR+IhK
J+f8E1ZEfB+a1TozUpM9+iv6Kyc5dLnrWWSyBiPaQVuLQPj8tTDk6eAQHAyaOO+m
3/x5pssR6Vn7lj2IKh0Ctw8VlzoyDZjQxWPYMcS4AQKBgA0+XNZQ9xrBEtWqpvlA
b8z4GOt2n2W2HI7A7kEs5CZNVHBbFaRKstFNDf7BNPD2P4B1mmYz02hYv1YNnyOT
hnoF5lXcuec68+t5WjjuZ7IXb9gF6MnuiHDSFzfFHb39+l4XrLv8QRCFqge8BBbl
CsPGsHjRQP31pfVTFrZp5ywg
-----END PRIVATE KEY-----`;

export function mockGitHubApp(partial?: Partial<GitHubApp>): GitHubApp {
	return {
		appId: 123456,
		slug: "jolli-test-app",
		clientId: "Iv1.test-client-id",
		clientSecret: "test-client-secret",
		webhookSecret: "test-webhook-secret",
		privateKey: testPrivateKey,
		name: "Jolli Test App",
		htmlUrl: "https://github.com/apps/jolli-test-app",
		createdAt: new Date(0),
		updatedAt: new Date(0),
		...partial,
	};
}
