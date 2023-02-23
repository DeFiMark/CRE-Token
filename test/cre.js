// We import Chai to use its asserting functions here.
const { expect } = require("chai");
const { ethers, waffle, BigNumber } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

describe("CRE Test", function () {
  
  let Router;
  let RouterContract;
  let Factory;
  let FactoryContract;
  
  let CRE;
  let CREContract;
  let BuyReceiver;
  let BuyReceiverContract;
  let SellReceiver;
  let SellReceiverContract;

  let CRESwapper;
  let CRESwapperContract;

  let WETHContract;
  let WETH;

  let pair;

  let owner;
  let addr1;
  let addr2;
  let addrs;
  const ONE_HUNDRED_MILLION = "100000000000000000000000000";
  const ONE_MILLION = "1000000000000000000000000";
  const ONE_HUNDRED = "100000000000000000000";
  const ONE = "1000000000000000000";

  // `beforeEach` will run before each test, re-deploying the contract every
  // time. It receives a callback, which can be async.
  beforeEach(async function () {
    
    // addresses
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    // Create WETH And BUSD
    WETHContract = await ethers.getContractFactory("contracts/DEX/WETH.sol:WBNB");
    WETH = await WETHContract.deploy();

    // Set Router And Factory
    FactoryContract = await ethers.getContractFactory("contracts/DEX/Factory.sol:DEXFactory");
    RouterContract = await ethers.getContractFactory("contracts/DEX/Router.sol:DEXRouter");
    Factory = await FactoryContract.deploy(owner.address);
    await Factory.setFeeTo(owner.address);
    Router = await RouterContract.deploy(Factory.address, WETH.address);

    // CRE Contracts
    CREContract = await ethers.getContractFactory("contracts/CRE/CRE.sol:CryptoRealEstate");
    CRESwapperContract = await ethers.getContractFactory("contracts/CRE/tokenSwapper.sol:TokenSwapper");
    BuyReceiverContract = await ethers.getContractFactory("contracts/CRE/BuyReceiver.sol:BuyReceiver");
    SellReceiverContract = await ethers.getContractFactory("contracts/CRE/SellReceiver.sol:SellReceiver");

    // Deploy Contracts
    CRE = await CREContract.deploy();
    CRESwapper = await CRESwapperContract.deploy(CRE.address, Router.address);
    BuyReceiver = await BuyReceiverContract.deploy(CRE.address);
    SellReceiver = await SellReceiverContract.deploy(CRE.address, owner.address);

    // Set CRE State
    await CRE.setBuyFeeRecipient(BuyReceiver.address);
    await CRE.setSellFeeRecipient(SellReceiver.address);
    await CRE.setTransferFeeRecipient(BuyReceiver.address);
    await CRE.setTokenSwapper(CRESwapper.address);

    // Create pair on router
    await Factory.createPair(CRE.address, WETH.address);
    pair = await Factory.getPair(CRE.address, WETH.address);

    // Add AMM
    await CRE.registerAutomatedMarketMaker(pair);

    // approve router for liquidity
    await CRE.approve(Router.address, ONE_MILLION);

    // Add Liquidity
    await Router.addLiquidityETH(
      CRE.address,
      ONE_MILLION,
      ONE_MILLION,
      ONE_HUNDRED,
      owner.address,
      ONE_MILLION,
      {
        value: ONE_HUNDRED,
        from: owner.address
      }
    );

  });


  describe("Deployment", function () {
    it("Should be able to deploy", async function() {
        expect(CRE.address).to.not.be.null;
        expect(CRESwapper.address).to.not.be.null;
        expect(BuyReceiver.address).to.not.be.null;
        expect(SellReceiver.address).to.not.be.null;
        expect(Factory.address).to.not.be.null;
        expect(Router.address).to.not.be.null;
        expect(WETH.address).to.not.be.null;
        expect(pair).to.not.be.null;
    });
    it("Should have constructor arguements stored in storage", async function() {
      const tokenAddress = await CRESwapper.token();
      expect(tokenAddress).to.equal(CRE.address);

      const buyReceiver = await CRE.buyFeeRecipient();
      expect(buyReceiver).to.equal(BuyReceiver.address);

      const sellReceiver = await CRE.sellFeeRecipient();
      expect(sellReceiver).to.equal(SellReceiver.address);
    });
  });

  describe("Transfer And Fee Checks", function () {
    it("Can Be Transferred To Other Wallet Without Fees", async function() {

        await CRE.connect(owner).transfer(addr1.address, ONE_MILLION);
        const addr1Balance = await CRE.balanceOf(addr1.address);

        expect(addr1Balance).to.equal(ONE_MILLION);
    });
    it("Can Be Transferred To Other Wallet With Fees", async function() {

        await CRE.connect(owner).transfer(addr1.address, ONE_MILLION);
        await CRE.connect(addr1).transfer(addr2.address, ONE_MILLION);

        const addr2Balance = await CRE.balanceOf(addr2.address);

        expect(addr2Balance.lt(ethers.BigNumber.from(ONE_MILLION))).to.be.true;
    });
    
    it("Can be sold", async function() {

      const ownerBalanceBefore = await CRE.balanceOf(owner.address);
      const lpBalanceBefore = await CRE.balanceOf(pair);

      await CRE.connect(owner).approve(Router.address, ONE_MILLION);
      await Router.connect(owner).swapExactTokensForETHSupportingFeeOnTransferTokens(
        ONE_MILLION,
        0,
        [ CRE.address, WETH.address ],
        owner.address,
        ONE_MILLION
      );

      const ownerBalanceAfter = await CRE.balanceOf(owner.address);
      const lpBalanceAfter = await CRE.balanceOf(pair);
      
      expect(ownerBalanceAfter.lt(ownerBalanceBefore)).to.be.true;
      expect(lpBalanceAfter.gt(lpBalanceBefore)).to.be.true;
    });
    it("Can Buy From Token Buy Function", async function() {

      const addr2BalanceBefore = await CRE.balanceOf(addr2.address);

      await CRE.connect(owner).buy(
        addr2.address,
        {
          value: ONE,
          from: owner.address
        }
        );
      const addr2BalanceAfter = await CRE.balanceOf(addr2.address);

      expect(addr2BalanceAfter.gt(addr2BalanceBefore)).to.be.true;

    });
    it("Can Buy Without Taxes", async function() {

      const ownerBalanceBefore = await CRE.balanceOf(owner.address);
      const receiverBalanceBefore = await CRE.balanceOf(BuyReceiver.address);

      await Router.connect(owner).swapExactETHForTokensSupportingFeeOnTransferTokens(
        0,
        [WETH.address, CRE.address],
        owner.address,
        ONE_MILLION,
        {
          value: ONE,
          from: owner.address
        }
        );
      const ownerBalanceAfter = await CRE.balanceOf(owner.address);
      const receiverBalanceAfter = await CRE.balanceOf(BuyReceiver.address);
      
      expect(ownerBalanceAfter.gt(ownerBalanceBefore)).to.be.true;
      expect(receiverBalanceAfter.eq(receiverBalanceBefore)).to.be.true;

    });
    it("Can Buy Through DEX", async function() {

      const addr2BalanceBefore = await CRE.balanceOf(addr2.address);

      await Router.connect(owner).swapExactETHForTokensSupportingFeeOnTransferTokens(
        0,
        [WETH.address, CRE.address],
        addr2.address,
        ONE_MILLION,
        {
          value: ONE,
          from: owner.address
        }
        );
      const addr2BalanceAfter = await CRE.balanceOf(addr2.address);

      expect(addr2BalanceAfter.gt(addr2BalanceBefore)).to.be.true;

    });
    it("Can Sell From Token Sell Function", async function() {

      await CRE.connect(owner).transfer(addr1.address, ONE_HUNDRED);
      const addr1Balance = await CRE.balanceOf(addr1.address);
      await CRE.connect(addr1).sell(addr1Balance);
      const addr1BalanceAfter = await CRE.balanceOf(addr1.address);

      expect(addr1Balance.gt(addr1BalanceAfter)).to.be.true;

    });
  });
});