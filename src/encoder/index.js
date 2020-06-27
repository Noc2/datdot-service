const { once } = require('events')
const sodium = require('sodium-universal')
const varint = require('varint')
const p2plex = require('p2plex')
const pump = require('pump')
const ndjson = require('ndjson')
const { seedKeygen } = require('noise-peer')

const NAMESPACE = 'datdot-encoder'
const IDENITY_NAME = 'signing'
const NOISE_NAME = 'noise'

const colors = require('colors/safe')
const NAME = __filename.split('/').pop().split('.')[0].toUpperCase()
function LOG (...msgs) {
  msgs = [`[${NAME}] `, ...msgs].map(msg => colors.green(msg))
  console.log(...msgs)
}

module.exports = class Encoder {
  constructor ({
    sdk,
    EncoderDecoder
  }) {
    const { Hypercore } = sdk
    this.sdk = sdk
    this.Hypercore = Hypercore
    this.EncoderDecoder = EncoderDecoder
  }

  static async load (opts) {
    const encoder = new Encoder(opts)

    await encoder.init()

    return encoder
  }

  async init () {
    const { publicKey: replicationPublicKey } = await this.sdk.getIdentity()

    const signingSeed = await this.sdk.deriveSecret(NAMESPACE, IDENITY_NAME)

    const signingPublicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES)
    const signingSecretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES)

    sodium.crypto_sign_seed_keypair(signingPublicKey, signingSecretKey, signingSeed)

    const noiseSeed = await this.sdk.deriveSecret(NAMESPACE, NOISE_NAME)

    const noiseKeyPair = seedKeygen(noiseSeed)

    this.signingPublicKey = signingPublicKey
    this.signingSecretKey = signingSecretKey
    this.replicationPublicKey = replicationPublicKey
    this.publicKey = noiseKeyPair.publicKey

    this.communication = p2plex({ keyPair: noiseKeyPair })
  }

  async encodeFor (hosterKey, feedKey, ranges) {

    LOG('HOSTER KEY', hosterKey)
    if (!Array.isArray(ranges)) {
      const index = ranges
      ranges = [[index, index]]
    }


    // TODO: Derive shared key
    const topic = feedKey

    const feed = this.Hypercore(feedKey)

    // TODO: Add timeout for when we can't find the hoster
    const peer = await this.communication.findByTopicAndPublicKey(topic, hosterKey, { announce: false, lookup: true })
    LOG('Connected to the hoster')
    const resultStream = ndjson.serialize()
    const confirmStream = ndjson.parse()

    const encodingStream = peer.createStream(topic)
    pump(resultStream, encodingStream, confirmStream)

    for (const range of ranges) {
      LOG('Get feeds for ranges', range)
      for (let index = range[0], len = range[1] + 1; index < len; index++) {
        LOG('Start encoding/hosting for index', index)
        // TODO: Add timeout for when we can't get feed data
        const data = await feed.get(index)

        const encoded = await this.EncoderDecoder.encode(data)
        LOG('Encoded data:', encoded)

        const { nodes, signature } = await feed.proof(index)
        // Allocate buffer for the proof
        const proof = Buffer.alloc(sodium.crypto_sign_BYTES)
        // Allocate buffer for the data that should be signed
        const toSign = Buffer.alloc(encoded.length + varint.encodingLength(index))

        // Write the index to the buffer that will be signed
        varint.encode(index, toSign, 0)
        // Copy the encoded data into the buffer that will be signed
        encoded.copy(toSign, varint.encode.bytes)

        // Sign the data with our singning scret key and write it to the proof buffer
        sodium.crypto_sign_detached(proof, toSign, this.signingSecretKey)
        // Send the encoded stuff over to the hoster so they can store it
        LOG('Sending data')
        resultStream.write({
          type: 'encoded',
          feed: feedKey,
          index,
          encoded,
          proof,
          nodes,
          signature
        })
        // --------------------------------------------------------------

        // Wait for the hoster to tell us they've handled the data
        // TODO: Set up timeout for when peer doesn't respond to us
        const [response] = await once(confirmStream, 'data')
        LOG('Confirmation reponse:', response)

        if (response.error) {
          throw new Error(response.error)
        }
      }
    }
    LOG('Ending the stream')
    encodingStream.end()
  }

  async close () {
    return this.communication.destroy()
  }
}
