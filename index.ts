import express, { Express, Request, Response } from "express";
import { ImmutableXClient, ImmutableMethodParams } from "@imtbl/imx-sdk";
import { InfuraProvider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import dotenv from "dotenv";

dotenv.config();

const app: Express = express();
const port = process.env.PORT;
interface BulkMintScriptArgs {
  wallet: string;
  number: number;
}
const provider = new InfuraProvider("ropsten", process.env.INFURA_API_KEY);

const waitForTransaction = async (
  promise: Promise<string>,
  component: String
) => {
  const txId = await promise;
  console.log(component, "Waiting for transaction", {
    txId,
    etherscanLink: `https://ropsten.etherscan.io/tx/${txId}`,
    alchemyLink: `https://dashboard.alchemyapi.io/mempool/eth-ropsten/tx/${txId}`,
  });
  const receipt = await provider.waitForTransaction(txId);
  if (receipt.status === 0) {
    throw new Error("Transaction rejected");
  }
  console.log(component, `Transaction Mined: ${receipt.blockNumber}`);
  return receipt;
};

app.listen(port, () => {
  console.log(`⚡️[server]: Server is running at https://localhost:${port}`);
});

app.get("/", (req: Request, res: Response) => {
  res.send("ts server is live");
});

app.get("/signInUser", async (req: Request, res: Response): Promise<void> => {
  const privateKey = process.env.REGISTER_USER;
  const component = "[IMX-USER-REGISTRATION]";
  const user = await ImmutableXClient.build({
    publicApiUrl: process.env.PUBLIC_API_URL!,
    starkContractAddress: process.env.STARK_CONTRACT_ADDRESS,
    registrationContractAddress: process.env.REGISTRATION_ADDRESS,
    gasLimit: process.env.GAS_LIMIT,
    gasPrice: process.env.GAS_PRICE,
    signer: new Wallet(privateKey!).connect(provider),
  });

  console.log(component, "Registering user...");

  let existingUser;
  let newUser;
  try {
    // Fetching existing user
    existingUser = await user.getUser({
      user: user.address,
    });
  } catch {
    try {
      // If user doesnt exist, create user
      newUser = await user.registerImx({
        etherKey: user.address,
        starkPublicKey: user.starkPublicKey,
      });
    } catch (error) {
      throw new Error(JSON.stringify(error, null, 2));
    }
  }

  if (existingUser) {
    console.log(component, "User already exists", user.address);
  } else {
    console.log(component, "User has been created", user.address);
  }
  console.log(JSON.stringify({ newUser, existingUser }, null, 2));

  res.send(JSON.stringify({ newUser, existingUser }, null, 2));
});

app.get("/mint", async (req: Request, res: Response): Promise<void> => {
  const component = "[imx-bulk-mint-script]";
  const privateKey = process.env.OWNER_PRIVATE_KEY;
  const BULK_MINT_MAX = process.env.BULK_MINT_MAX;
  //   const { wallet, number } = parse<BulkMintScriptArgs>({
  //     wallet: {
  //       type: String,
  //       alias: 'w',
  //       description: 'Wallet to receive minted NFTs',
  //     },
  //     number: {
  //       type: Number,
  //       alias: 'n',
  //       description: `Number of NFTS to mint. Maximum: ${BULK_MINT_MAX}`,
  //     },
  //   });
  const { wallet, number } = <BulkMintScriptArgs>{
    wallet: "0x84daa703e1cbad82416a1122c7c4e213b64eba44",
    number: 1,
  };
  if (number >= Number(BULK_MINT_MAX))
    throw new Error(`tried to mint too many tokens. Maximum ${BULK_MINT_MAX}`);

  const tokenId = parseInt(process.env.tokenId!, 10);
  console.log("tokenId");
  console.log(tokenId);

  const minter = await ImmutableXClient.build({
    publicApiUrl: process.env.PUBLIC_API_URL!,
    starkContractAddress: process.env.STARK_CONTRACT_ADDRESS,
    registrationContractAddress: process.env.REGISTRATION_ADDRESS,
    gasLimit: process.env.GAS_LIMIT,
    gasPrice: process.env.GAS_PRICE,
    signer: new Wallet(privateKey!).connect(provider),
  });

  console.log(component, "MINTER REGISTRATION");
  const registerImxResult = await minter.registerImx({
    etherKey: minter.address.toLowerCase(),
    starkPublicKey: minter.starkPublicKey,
  });

  if (registerImxResult.tx_hash === "") {
    console.log(component, "Minter registered, continuing...");
  } else {
    console.log(component, "Waiting for minter registration...");
    await waitForTransaction(
      Promise.resolve(registerImxResult.tx_hash),
      component
    );
  }

  console.log(component, `OFF-CHAIN MINT ${number} NFTS`);

  try {
    const tokens = Array.from({ length: number }, (_, i) => i).map((i) => ({
      id: (tokenId + i).toString(),
      blueprint: "onchain-metadata",
    }));

    const payload: ImmutableMethodParams.ImmutableOffchainMintV2ParamsTS = [
      {
        contractAddress: process.env.TOKEN_ADDRESS!, // NOTE: a mintable token contract is not the same as regular erc token contract
        users: [
          {
            etherKey: `${wallet}`.toLowerCase(),
            tokens,
          },
        ],
      },
    ];

    const result = await minter.mintV2(payload);
    console.log(result);
    res.send(result);
  } catch (err) {
    console.log(err);
  }
});
