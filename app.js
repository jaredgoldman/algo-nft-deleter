require('dotenv').config();

const { makeAssetDestroyTxnWithSuggestedParams } = require('algosdk');
const algosdk = require('algosdk');

const ALGO_MNEMONIC = process.env.ALGO_MNEMONIC;
const PURESTAKE_API = process.env.PURESTAKE_API;
const ALGO_NODE = process.env.ALGO_NODE;

const algodToken = {
  'X-API-Key': PURESTAKE_API,
};
const algodServer = ALGO_NODE;
const algodPort = '';

const { addr: address, sk } = algosdk.mnemonicToSecretKey(ALGO_MNEMONIC);
const algodClient = new algosdk.Algodv2(algodToken, algodServer, algodPort);

const asyncForEach = async (array, callback) => {
  for (let index = 0; index < array.length; index++) {
    try {
      await callback(array[index], index, array);
    } catch (error) {
      console.log('error', error);
    }
  }
};

const waitForConfirmation = async function (algodClient, txId, timeout) {
  if (algodClient == null || txId == null || timeout < 0) {
    throw new Error('Bad arguments');
  }

  const status = await algodClient.status().do();
  if (status === undefined) {
    throw new Error('Unable to get node status');
  }

  const startround = status['last-round'] + 1;
  let currentround = startround;

  while (currentround < startround + timeout) {
    const pendingInfo = await algodClient
      .pendingTransactionInformation(txId)
      .do();
    if (pendingInfo !== undefined) {
      if (
        pendingInfo['confirmed-round'] !== null &&
        pendingInfo['confirmed-round'] > 0
      ) {
        //Got the completed Transaction
        return pendingInfo;
      } else {
        if (
          pendingInfo['pool-error'] != null &&
          pendingInfo['pool-error'].length > 0
        ) {
          // If there was a pool error, then the transaction has been rejected!
          throw new Error(
            'Transaction ' +
              txId +
              ' rejected - pool error: ' +
              pendingInfo['pool-error']
          );
        }
      }
    }
    await algodClient.statusAfterBlock(currentround).do();
    currentround++;
  }
  throw new Error(
    'Transaction ' + txId + ' not confirmed after ' + timeout + ' rounds!'
  );
};

const getAssetIds = async () => {
  try {
    let accountInfo = await algodClient.accountInformation(address).do();
    return accountInfo['created-assets'];
  } catch (error) {
    console.log(error);
  }
};

const deleteAssets = async (assets) => {
  const params = await algodClient.getTransactionParams().do();
  asyncForEach(assets, async (asset) => {
    const from = address;
    const note = new Uint8Array({});
    const assetIndex = asset.index;

    const txn = makeAssetDestroyTxnWithSuggestedParams(
      from,
      note,
      assetIndex,
      params
    );
    const signedTxn = txn.signTxn(sk);
    const tx = await algodClient.sendRawTransaction(signedTxn).do();

    await waitForConfirmation(algodClient, tx.txId, 1000);
    const ptx = await algodClient.pendingTransactionInformation(tx.txId).do();
    console.log('ptx', ptx);
  });
};

const main = async () => {
  const assets = await getAssetIds();
  deleteAssets(assets);
};

main();
