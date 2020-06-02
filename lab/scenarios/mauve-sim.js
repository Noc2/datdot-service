const SDK = require('dat-sdk')
const storage = require('random-access-memory')
const levelup = require('levelup')
const memdown = require('memdown')

const Encoder = require('../../src/encoder')
const Hoster = require('../../src/hoster')
const EncoderDecoder = require('../../src/EncoderDecoder')

/**

- Initialize encoder, hoster and publisher
- Make hypercore
- Request hosting
- Chain notifies hoster to host data
- Hoster requests encoding for each block
- Encoder encodes data and send it to hoster
- Hoster tells encoder it's stored
- Encoder tells chain it's encoded
- Hoster tells chain it's stored
- Chain tells publisher it's stored

**/

// This is a standin for some of the interfaces from the blockchain
class FakeBlockchain {
  init (hoster, encoder) {
    this.hoster = hoster
    this.encoder = encoder
  }

  async requestHosting (feed, plan) {
    console.log('Publisher requested hosting for', feed, plan)
    console.log('Pairing hoster and encoder', this.hoster.publicKey, this.encoder.publicKey)
    await Promise.all([
      this.hoster.addFeed(feed, this.encoder.publicKey, plan),
      await this.encoder.encodeFor(this.hoster.publicKey, feed, plan)
    ])
  }
}

run()

async function run () {
  const chain = new FakeBlockchain()

  const encoderSDK = await SDK({ storage })
  const encoder = await Encoder.load({
    EncoderDecoder,
    sdk: encoderSDK
  })

  const hosterSDK = await SDK({ storage })
  const hosterDB = levelup(memdown())
  const hoster = await Hoster.load({
    EncoderDecoder,
    db: hosterDB,
    sdk: hosterSDK
  })

  chain.init(hoster, encoder)

  const publisherSDK = await SDK({ storage })

  const feed = publisherSDK.Hypercore('my feed')

  await feed.append('Hello World!')

  // This is where all the magic happens
  await chain.requestHosting(feed.key)

  console.log('fully hosted!')
}
