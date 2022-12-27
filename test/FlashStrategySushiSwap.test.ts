import { ethers } from "hardhat";
import { constants } from "ethers";
import { assert, expect } from "chai";
import {
    FarmingLPTokenFactory,
    FarmingLPToken__factory,
    FlashFToken__factory,
    UniswapV2Pair__factory,
    SushiBarVault,
    FlashStrategySushiSwapFactory,
    FlashStrategySushiSwap__factory,
    FeeVault,
} from "../typechain-types";
import setupSushiswap, { SUSHI_PER_BLOCK } from "./utils/setupSushiswap";
import setupTokens from "./utils/setupTokens";
import addressEquals from "./utils/addressEquals";
import now from "./utils/now";
import setupFlashStake from "./utils/setupFlashStake";

const ONE = ethers.constants.WeiPerEther;
const YEAR = 365 * 24 * 3600;
const DELTA = ethers.BigNumber.from(10).pow(8);

const fee = (amount, feeBPS) => amount.mul(feeBPS).div(10000);

const setupTest = async feeRecipient => {
    const tokens = await setupTokens();
    const sushi = await setupSushiswap(tokens);
    const flash = await setupFlashStake();
    const [deployer, alice, bob, carol] = await ethers.getSigners();

    const SBVault = await ethers.getContractFactory("SushiBarVault");
    const sbVault = (await SBVault.deploy(tokens.sushi.address, sushi.bar.address)) as SushiBarVault;

    const FLPFactory = await ethers.getContractFactory("FarmingLPTokenFactory");
    const flpFactory = (await FLPFactory.deploy(
        sushi.router.address,
        sushi.chef.address,
        sbVault.address
    )) as FarmingLPTokenFactory;

    const Factory = await ethers.getContractFactory("FlashStrategySushiSwapFactory");
    const factory = (await Factory.deploy(
        flash.protocol.address,
        flpFactory.address,
        feeRecipient.address
    )) as FlashStrategySushiSwapFactory;

    const createFlashStrategySushiSwap = async (token0, token1, allocPoint) => {
        const { pid, lpToken } = await sushi.addPool(token0, token1, allocPoint);
        await factory.createFlashStrategySushiSwap(pid);

        const strategy = FlashStrategySushiSwap__factory.connect(
            await factory.getFlashStrategySushiSwap(pid),
            ethers.provider
        );
        const flpToken = FarmingLPToken__factory.connect(await strategy.flpToken(), ethers.provider);

        await flash.protocol.registerStrategy(
            strategy.address,
            flpToken.address,
            "FlashStrategySushiSwap " + (await flpToken.name()),
            "f" + (await flpToken.symbol()) + "-" + flpToken.address.substring(2, 6)
        );

        const fToken = FlashFToken__factory.connect(await strategy.fToken(), ethers.provider);

        return {
            pid,
            lpToken,
            flpToken,
            strategy,
            fToken,
        };
    };

    const findPathToSushi = async tokenAddressIn => {
        if (addressEquals(tokenAddressIn, tokens.sushi.address)) {
            return [tokens.sushi.address];
        }
        const pair = await sushi.factory.getPair(tokenAddressIn, tokens.sushi.address);
        if (addressEquals(pair, constants.AddressZero)) {
            const length = (await sushi.factory.allPairsLength()).toNumber();
            for (let i = 0; i < length; i++) {
                const lpToken = UniswapV2Pair__factory.connect(await sushi.factory.allPairs(i), ethers.provider);
                const token0 = await lpToken.token0();
                const token1 = await lpToken.token1();
                if (addressEquals(tokenAddressIn, token0) || addressEquals(tokenAddressIn, token1)) {
                    const bridge = addressEquals(tokenAddressIn, token0) ? token1 : token0;
                    if ((await sushi.factory.getPair(bridge, tokens.sushi.address)) != constants.AddressZero) {
                        return [tokenAddressIn, bridge, tokens.sushi.address];
                    }
                }
            }
            assert(false, "cannot find path to sushi");
        } else {
            return [tokenAddressIn, tokens.sushi.address];
        }
    };

    const quote = async (amountIn, path) => {
        if (path.length < 2) return amountIn;
        const amountOuts = await sushi.router.getAmountsOut(amountIn, path);
        return amountOuts[amountOuts.length - 1];
    };

    const getStakeParameters = async (lpToken, amountLP, beneficiary) => {
        const [token0, token1] = [await lpToken.token0(), await lpToken.token1()];
        const totalSupply = await lpToken.totalSupply();
        const [reserve0, reserve1] = await lpToken.getReserves();
        const amount0 = reserve0.mul(amountLP).div(totalSupply);
        const amount1 = reserve1.mul(amountLP).div(totalSupply);

        const path0 = await findPathToSushi(token0);
        const path1 = await findPathToSushi(token1);
        const amount = (await quote(amount0, path0)).add(await quote(amount1, path1));

        return [amountLP, path0, path1, amount, beneficiary.address, (await now()) + 60] as const;
    };

    const mintSLP = async (account, flpToken, amountToken) => {
        const lpToken = UniswapV2Pair__factory.connect(await flpToken.lpToken(), ethers.provider);

        if ((await lpToken.totalSupply()).isZero()) {
            amountToken = amountToken.add(1000);
        }
        await tokens.sushi.transfer(account.address, amountToken);
        await tokens.weth.connect(account).deposit({ value: amountToken });
        await sushi.addLiquidity(account, tokens.sushi, tokens.weth, amountToken, amountToken);

        const amountLP = await lpToken.balanceOf(account.address);
        await lpToken.connect(account).approve(flpToken.address, constants.MaxUint256);
        const params = await getStakeParameters(lpToken, amountLP, account);
        await flpToken.connect(account).deposit(...params);
        return params[3];
    };

    return {
        deployer,
        alice,
        bob,
        carol,
        tokens,
        sushi,
        sbVault,
        flpFactory,
        flash,
        mintSLP,
        createFlashStrategySushiSwap,
    };
};

describe("FlashStrategySushiSwap", function () {
    it("should stake for 1 account", async function () {
        const Vault = await ethers.getContractFactory("FeeVault");
        const feeVault = (await Vault.deploy()) as FeeVault;

        const { alice, tokens, flash, createFlashStrategySushiSwap, mintSLP } = await setupTest(feeVault);

        // add SUSHI-WETH pool, flpToken and strategy
        const { strategy, flpToken, fToken } = await createFlashStrategySushiSwap(tokens.sushi, tokens.weth, 100);

        const amount = ONE.mul(100);
        const amountLP = await mintSLP(alice, flpToken, amount);
        expect(await flpToken.balanceOf(alice.address)).to.be.equal(amountLP);

        await flpToken.connect(alice).approve(flash.protocol.address, constants.MaxUint256);
        // 100 SUSHI is pending
        expect(await flpToken.balanceOf(alice.address)).to.be.approximately(amountLP.add(SUSHI_PER_BLOCK), DELTA);

        // stake all SLP (staked LP amount + 200 pending SUSHI)
        const amountSLP = amountLP.add(SUSHI_PER_BLOCK.mul(2));
        await flash.protocol.connect(alice).stake(strategy.address, amountSLP, YEAR, alice.address, false);
        expect(await flpToken.balanceOf(alice.address)).to.be.equal(0);
        expect(await flpToken.balanceOf(strategy.address)).to.be.approximately(
            amountSLP.sub(fee(amountSLP, 25)),
            DELTA
        );
        expect(await flpToken.balanceOf(feeVault.address)).to.be.approximately(fee(amountSLP, 25), DELTA);
        expect(await fToken.balanceOf(alice.address)).to.be.approximately(amountSLP, DELTA);
    });
});
