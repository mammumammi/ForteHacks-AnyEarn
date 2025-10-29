//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

/**
 * ServiceNFT - NFT Escrow Contract for Service Requests
 * When a service is accepted, an NFT is minted representing the partnership
 * The NFT holds the escrow funds and is burnt upon completion
 */
contract ServiceNFT is ERC721URIStorage, Ownable {
    uint256 private _tokenIdCounter;
    
    struct ServiceNFTData {
        uint256 serviceId;
        address requester;
        address acceptor;
        uint256 escrowAmount;
        bool completed;
        uint256 createdAt;
    }
    
    // Mapping from token ID to service NFT data
    mapping(uint256 => ServiceNFTData) public serviceNFTs;
    
    // Mapping from service ID to token ID
    mapping(uint256 => uint256) public serviceToToken;
    
    // Events
    event ServiceNFTMinted(
        uint256 indexed tokenId,
        uint256 indexed serviceId,
        address indexed requester,
        address acceptor,
        uint256 escrowAmount
    );
    
    event ServiceNFTCompleted(
        uint256 indexed tokenId,
        uint256 indexed serviceId,
        address indexed acceptor,
        uint256 amount
    );
    
    constructor() ERC721("ServiceNFT", "SNFT") Ownable(msg.sender) {
        _tokenIdCounter = 0;
    }
    
    /**
     * Mint a service NFT when service is accepted
     * The NFT is jointly owned (approved for both parties)
     * @param _serviceId - Service ID from ServiceContract
     * @param _requester - Address of service requester
     * @param _acceptor - Address of service acceptor
     */
    function mintServiceNFT(
        uint256 _serviceId,
        address _requester,
        address _acceptor
    ) public payable returns (uint256) {
        require(msg.value > 0, "Escrow amount must be greater than 0");
        require(_requester != address(0), "Invalid requester address");
        require(_acceptor != address(0), "Invalid acceptor address");
        require(serviceToToken[_serviceId] == 0, "NFT already exists for this service");
        
        _tokenIdCounter++;
        uint256 newTokenId = _tokenIdCounter;
        
        // Mint NFT to requester (but give approval to acceptor)
        _safeMint(_requester, newTokenId);
        
        // Grant approval to acceptor
        approve(_acceptor, newTokenId);
        
        // Store service NFT data
        serviceNFTs[newTokenId] = ServiceNFTData({
            serviceId: _serviceId,
            requester: _requester,
            acceptor: _acceptor,
            escrowAmount: msg.value,
            completed: false,
            createdAt: block.timestamp
        });
        
        serviceToToken[_serviceId] = newTokenId;
        
        // Set token URI (you can customize this)
        string memory uri = string(abi.encodePacked(
            "data:application/json;base64,",
            _generateTokenURI(_serviceId, msg.value)
        ));
        _setTokenURI(newTokenId, uri);
        
        console.log("Service NFT minted:", newTokenId);
        console.log("Service ID:", _serviceId);
        console.log("Escrow amount:", msg.value);
        
        emit ServiceNFTMinted(newTokenId, _serviceId, _requester, _acceptor, msg.value);
        
        return newTokenId;
    }
    
    /**
     * Complete service and burn NFT, transferring funds to acceptor
     * Can only be called by the requester
     * @param _tokenId - Token ID of the service NFT
     */
    function completeServiceAndBurn(uint256 _tokenId) public {
        require(_tokenId > 0 && _tokenId <= _tokenIdCounter, "Invalid token ID");
        ServiceNFTData storage nftData = serviceNFTs[_tokenId];
        require(nftData.requester == msg.sender, "Only requester can complete");
        require(!nftData.completed, "Service already completed");
        require(nftData.escrowAmount > 0, "No escrow funds");
        
        // Mark as completed
        nftData.completed = true;
        
        // Transfer escrow to acceptor
        uint256 amount = nftData.escrowAmount;
        address acceptor = nftData.acceptor;
        
        // Burn the NFT
        _burn(_tokenId);
        
        // Transfer funds
        (bool success, ) = acceptor.call{value: amount}("");
        require(success, "Transfer failed");
        
        console.log("Service NFT burned:", _tokenId);
        console.log("Funds transferred to:", acceptor);
        console.log("Amount:", amount);
        
        emit ServiceNFTCompleted(_tokenId, nftData.serviceId, acceptor, amount);
    }
    
    /**
     * Get service NFT data
     * @param _tokenId - Token ID
     */
    function getServiceNFT(uint256 _tokenId) public view returns (ServiceNFTData memory) {
        require(_tokenId > 0 && _tokenId <= _tokenIdCounter, "Invalid token ID");
        return serviceNFTs[_tokenId];
    }
    
    /**
     * Get token ID for a service
     * @param _serviceId - Service ID
     */
    function getTokenIdForService(uint256 _serviceId) public view returns (uint256) {
        return serviceToToken[_serviceId];
    }
    
    /**
     * Generate base64 encoded token URI
     */
    function _generateTokenURI(uint256 _serviceId, uint256 _amount) private pure returns (string memory) {
        // Simple JSON metadata (you can enhance this)
        return "eyJuYW1lIjogIlNlcnZpY2UgTkZUIiwgImRlc2NyaXB0aW9uIjogIkVzY3JvdyBORlQgZm9yIHNlcnZpY2UgcmVxdWVzdCIsICJhdHRyaWJ1dGVzIjogW119";
    }
    
    /**
     * Allow contract to receive ETH
     */
    receive() external payable {}
}