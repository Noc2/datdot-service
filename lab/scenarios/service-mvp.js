const Account = require('../../src/account')
const ACCOUNTS = require('./accounts.json')

const getChainAPI = require('../../src/temp_helpers/chainAPI-mvp') // to use substrate node

const LOG = requiire('debug')(NAME)

/*
Scenario:
1. Create ACCOUNTS
2. Publish DATA
3. Wait for event log (if Something Stored, then ->)
4. Register HOSTERS

Behavior:
- NeWPin event logs always same account addres, but correct hypercore key
- SomethingStored could be renamed to NewPublishedData / DataPublished / PublishSucceeded?
*/

/* --------------------------------------
              A. SETUP FLOW
----------------------------------------- */

// 1. Get substrate chain API
async function setup () {
  const chainAPI = await getChainAPI()
  const serviceAPI = {}
  const accounts = {}

	for(let name in ACCOUNTS) {
		const account = await makeAccount(name)
		accounts[name] = account
	}

  start(chainAPI, serviceAPI, accounts)
}
setup()

// 2. `make ACCOUNT`
async function makeAccount (name) {
	return Account.load({
		persist: false,
		application: `datdot-account-${name}`
	})
}

async function start (chainAPI, serviceAPI, accounts) {
	// Iterate through accounts and perform their roles
	const publishedKeys = []

  publishData()
  chainAPI.listenToEvents(handleEvent)


  /* --------------------------------------
            B. COMMIT FLOW
  ----------------------------------------- */
  // 1. `publish DATA`
  async function publishData () {
		for(let name in accounts) {
			const account = accounts[name]
			const opts = ACCOUNTS[name]
			if(!opts.publisher) continue

			// Get a hypercore for this account
			const core = account.Hypercore('Datdot MVP')
			await core.ready()

			if(!core.length) await core.append('Hello World!')

			
    const opts = {
      registerPayload: hypercoreArr,
      account
    }
    await chainAPI.publishData(opts)
		}

  }
  /* --------------------------------------
        C. REGISTERING FLOW
  ----------------------------------------- */
  // 1. `register HOSTER`
  async function registerHoster () {
    for (const account of accounts) {
	    await chainAPI.registerHoster({ account })
    }
  }

  // 2. `register ENCODER`

  // 3. `register ATTESTER`
  async function registerAttestor () {
    for (const account of accounts) {
      await chainAPI.registerAttestor({ account })
    }
  }
  /* --------------------------------------
            D. CHALLENGES FLOW
  ----------------------------------------- */
  let signer = 0
  async function submitChallenge (data) { // submitChallenge
    const userID = data[0]
    const feedID = data[1]
    const opts = { account: accounts[signer], userID, feedID }
    signer <= accounts.length - 1 ? signer++ : signer = 0
    await chainAPI.submitChallenge(opts)
  }

  async function getChallenges (data) {
    const user = data[0]
    const opts = { user, accounts, respondToChallenges }
    const responses = await chainAPI.getChallenges(opts)
    await respondToChallenges(responses)
  }

  async function respondToChallenges (responses) {
    const feeds = (await hypercoreArr_promise)[1]
    const opts = { responses, feeds, keyring }
    await chainAPI.sendProof(opts)
  }

  async function attestPhase (data) {
    LOG('EVENT', data.toString('hex'))
    const challengeID = data[0]
    const obj = JSON.parse(data[1])
    const attestorIDs = obj.expected_attestors
    const opts = { challengeID, attestorIDs, keyring }
    await chainAPI.attest(opts)
  }
  /* --------------------------------------
            E. EVENTS
  ----------------------------------------- */
  async function handleEvent (event) {
    const address = event.data[0]
    LOG('New event:', event.method, event.data.toString())
    if (event.method === 'SomethingStored') {
      await registerAttestor()
      await registerHoster()
    }
    if (event.method === 'NewPin') await submitChallenge(event.data)
    if (event.method === 'Challenge') getChallenges(event.data)
    if (event.method === 'ChallengeFailed') { }
    if (event.method === 'AttestPhase') attestPhase(event.data)
  }
}
