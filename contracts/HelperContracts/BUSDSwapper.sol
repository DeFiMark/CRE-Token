//SPDX-License-Identifier: MIT
pragma solidity 0.8.14;

import "./IUniswapV2Router02.sol";
import "./IERC20.sol";

/**
    DFA Swapper Contract
    Created by DeFi Mark
 */
contract BUSDSwapper {

    // DEX Router
    IUniswapV2Router02 public router;
    address[] buyPath;
    address[] sellPath;

    constructor(
        address token_,
        address router_
    ) {

        // initialize router
        router = IUniswapV2Router02(router_);

        // initialize buy path
        buyPath = new address[](2);
        buyPath[0] = router.WETH();
        buyPath[1] = token_;

        // initialize sell path
        sellPath = new address[](2);
        sellPath[0] = token_;
        sellPath[1] = router.WETH();
    }

    function buy(address user) external payable {
        router.swapExactETHForTokensSupportingFeeOnTransferTokens{value: address(this).balance}(
            0, buyPath, user, block.timestamp + 10
        );
    }

    receive() external payable {
        router.swapExactETHForTokensSupportingFeeOnTransferTokens{value: address(this).balance}(
            0, buyPath, msg.sender, block.timestamp + 10
        );
    }
}