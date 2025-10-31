// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

/**
 * @title ServiceNFT
 * @dev NFT contract that holds funds in escrow until service completion
 * When NFT is minted, funds are locked. When burned, funds are released.
 */
contract ServiceNFT is ERC721, Ownable {
    uint256 private _tokenIdCounter;
    
    struct NFTData {
        uint256 serviceId;
        address requester;
        address acceptor;
        uint256 escrowAmount;
        bool completed;
    }
    
    mapping(uint256 => NFTData) public nftData;
    mapping(uint256 => uint256) public serviceToTokenId;
    
    address public serviceContract;
    
    event NFTMinted(uint256 indexed tokenId, uint256 indexed serviceId, address requester, address acceptor, uint256 amount);
    event NFTBurned(uint256 indexed tokenId, uint256 indexed serviceId, address acceptor, uint256 amount);
    event EscrowReleased(uint256 indexed tokenId, address indexed recipient, uint256 amount);

    constructor() ERC721("ServiceNFT", "SNFT") Ownable(msg.sender) {
        console.log("ServiceNFT deployed by:", msg.sender);
    }

    /**
     * @dev Set the authorized ServiceContract address
     * CRITICAL: Must be called after ServiceContract deployment
     */
    function setServiceContract(address _serviceContract) external onlyOwner {
        require(_serviceContract != address(0), "Invalid address");
        serviceContract = _serviceContract;
        console.log("ServiceContract set to:", _serviceContract);
    }

    modifier onlyServiceContract() {
        require(msg.sender == serviceContract, "Only ServiceContract can call this");
        _;
    }

    /**
     * @dev Mint NFT and lock funds in escrow
     * Called by ServiceContract when service is accepted
     */
    function mintServiceNFT(
        uint256 _serviceId,
        address _requester,
        address _acceptor
    ) external payable onlyServiceContract returns (uint256) {
        require(msg.value > 0, "No funds sent");
        require(_requester != address(0), "Invalid requester");
        require(_acceptor != address(0), "Invalid acceptor");
        require(serviceToTokenId[_serviceId] == 0, "NFT already minted for this service");

        _tokenIdCounter++;
        uint256 newTokenId = _tokenIdCounter;

        // Mint NFT to acceptor (service provider)
        _safeMint(_acceptor, newTokenId);

        // Store NFT data
        nftData[newTokenId] = NFTData({
            serviceId: _serviceId,
            requester: _requester,
            acceptor: _acceptor,
            escrowAmount: msg.value,
            completed: false
        });

        // Map service ID to token ID
        serviceToTokenId[_serviceId] = newTokenId;

        console.log("NFT minted - Token ID:", newTokenId);
        console.log("Service ID:", _serviceId);
        console.log("Escrow amount:", msg.value);
        console.log("Acceptor:", _acceptor);

        emit NFTMinted(newTokenId, _serviceId, _requester, _acceptor, msg.value);

        return newTokenId;
    }

    /**
     * @dev Complete service, burn NFT, and release funds to acceptor
     * Called by ServiceContract when requester verifies completion
     */
    function completeServiceAndBurn(uint256 _tokenId) external onlyServiceContract {
        require(_tokenId > 0 && _tokenId <= _tokenIdCounter, "Invalid token ID");
        require(_ownerOf(_tokenId) != address(0), "Token does not exist");
        
        NFTData storage data = nftData[_tokenId];
        require(!data.completed, "Service already completed");
        require(data.escrowAmount > 0, "No funds in escrow");

        address acceptor = data.acceptor;
        uint256 amount = data.escrowAmount;
        uint256 serviceId = data.serviceId;

        // Mark as completed
        data.completed = true;

        // Burn the NFT
        _burn(_tokenId);

        // Release funds to acceptor (service provider)
        (bool success, ) = acceptor.call{value: amount}("");
        require(success, "Fund transfer failed");

        console.log("NFT burned - Token ID:", _tokenId);
        console.log("Funds released to:", acceptor);
        console.log("Amount:", amount);

        emit NFTBurned(_tokenId, serviceId, acceptor, amount);
        emit EscrowReleased(_tokenId, acceptor, amount);
    }

    /**
     * @dev Get token ID for a service
     */
    function getTokenIdForService(uint256 _serviceId) external view returns (uint256) {
        return serviceToTokenId[_serviceId];
    }

    /**
     * @dev Get NFT data for a token
     */
    function getNFTData(uint256 _tokenId) external view returns (NFTData memory) {
        require(_tokenId > 0 && _tokenId <= _tokenIdCounter, "Invalid token ID");
        return nftData[_tokenId];
    }

    /**
     * @dev Get current token counter
     */
    function getTokenCounter() external view returns (uint256) {
        return _tokenIdCounter;
    }

    /**
     * @dev Override to prevent transfers while service is active
     */
    function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        
        // Allow minting (from == address(0))
        if (from == address(0)) {
            return super._update(to, tokenId, auth);
        }
        
        // Allow burning (to == address(0))
        if (to == address(0)) {
            return super._update(to, tokenId, auth);
        }
        
        // Prevent transfers while service is active
        revert("ServiceNFT: Cannot transfer active service NFT");
    }

    /**
     * @dev Allow contract to receive ETH
     */
    receive() external payable {
        console.log("ServiceNFT received:", msg.value);
    }

    /**
     * @dev Emergency withdraw (only owner, only if no active services)
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        
        // Check no active NFTs
        for (uint256 i = 1; i <= _tokenIdCounter; i++) {
            if (_ownerOf(i) != address(0)) {
                revert("Cannot withdraw with active NFTs");
            }
        }
        
        (bool success, ) = owner().call{value: balance}("");
        require(success, "Withdrawal failed");
    }
}