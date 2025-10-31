//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "hardhat/console.sol";

interface IServiceNFT {
    function mintServiceNFT(uint256 _serviceId, address _requester, address _acceptor) external payable returns (uint256);
    function completeServiceAndBurn(uint256 _tokenId) external;
    function getTokenIdForService(uint256 _serviceId) external view returns (uint256);
}

/**
 * A smart contract that manages service requests with NFT escrow
 * Implements two-signature approval system with image proof of completion
 */
contract ServiceContract {
    struct Service {
        uint256 id;
        string title;
        string startLocation;
        string endLocation;
        uint256 flowAmount;
        address requester;
        address pendingAcceptor;
        address acceptedBy;
        bool completed;
        uint256 createdAt;
        uint256 nftTokenId;
        string imageIpfsHash;           // Service request image
        string completionImageHash;     // Completion proof image
        bool completionSubmitted;       // Has acceptor submitted completion image?
    }

    uint256 public serviceCount;
    mapping(uint256 => Service) public services;
    mapping(address => uint256[]) public requesterServices;
    mapping(address => uint256[]) public acceptedServices;
    mapping(address => uint256) public activeServicesCount;
    uint256 public constant MAX_ACTIVE_SERVICES = 10;
    
    IServiceNFT public serviceNFT;

    event ServiceCreated(
        uint256 indexed id,
        address indexed requester,
        string title,
        string startLocation,
        string endLocation,
        uint256 flowAmount,
        string imageIpfsHash
    );
    
    event ServiceAcceptanceRequested(
        uint256 indexed id,
        address indexed requester,
        address indexed pendingAcceptor
    );
    
    event ServiceAccepted(
        uint256 indexed id,
        address indexed requester,
        address indexed acceptedBy,
        uint256 nftTokenId
    );
    
    event ServiceAcceptanceRejected(
        uint256 indexed id,
        address indexed requester,
        address indexed rejectedAcceptor
    );
    
    event CompletionImageSubmitted(
        uint256 indexed id,
        address indexed acceptedBy,
        string completionImageHash
    );
    
    event ServiceCompleted(
        uint256 indexed id,
        address indexed requester,
        address indexed acceptedBy,
        uint256 nftTokenId
    );
    
    event ServiceCancelled(
        uint256 indexed id,
        address indexed requester
    );

    constructor(address _serviceNFTAddress) {
        serviceNFT = IServiceNFT(_serviceNFTAddress);
    }

    function createService(
        string memory _title,
        string memory _startLocation,
        string memory _endLocation,
        string memory _imageIpfsHash
    ) public payable {
        require(msg.value > 0, "Flow amount must be greater than 0");
        require(bytes(_title).length > 0, "Title cannot be empty");
        require(bytes(_startLocation).length > 0, "Start location cannot be empty");
        require(bytes(_endLocation).length > 0, "End location cannot be empty");
        require(bytes(_imageIpfsHash).length > 0, "Image hash cannot be empty");
        require(activeServicesCount[msg.sender] < MAX_ACTIVE_SERVICES, "Too many active services");

        serviceCount++;
        services[serviceCount] = Service({
            id: serviceCount,
            title: _title,
            startLocation: _startLocation,
            endLocation: _endLocation,
            flowAmount: msg.value,
            requester: msg.sender,
            pendingAcceptor: address(0),
            acceptedBy: address(0),
            completed: false,
            createdAt: block.timestamp,
            nftTokenId: 0,
            imageIpfsHash: _imageIpfsHash,
            completionImageHash: "",
            completionSubmitted: false
        });

        requesterServices[msg.sender].push(serviceCount);
        activeServicesCount[msg.sender]++;

        console.log("Service created with ID:", serviceCount);
        console.log("Image IPFS Hash:", _imageIpfsHash);

        emit ServiceCreated(
            serviceCount, 
            msg.sender, 
            _title, 
            _startLocation, 
            _endLocation, 
            msg.value,
            _imageIpfsHash
        );
    }

    function requestServiceAcceptance(uint256 _serviceId) public {
        require(_serviceId > 0 && _serviceId <= serviceCount, "Invalid service ID");
        Service storage service = services[_serviceId];
        require(service.acceptedBy == address(0), "Service already accepted");
        require(service.pendingAcceptor == address(0), "Acceptance already pending");
        require(service.completed == false, "Service already completed");
        require(service.requester != msg.sender, "Cannot accept your own service");

        service.pendingAcceptor = msg.sender;

        console.log("Acceptance requested for service:", _serviceId);
        console.log("Pending acceptor:", msg.sender);

        emit ServiceAcceptanceRequested(_serviceId, service.requester, msg.sender);
    }

    function approveServiceAcceptance(uint256 _serviceId) public {
        require(_serviceId > 0 && _serviceId <= serviceCount, "Invalid service ID");
        Service storage service = services[_serviceId];
        require(service.requester == msg.sender, "Only requester can approve");
        require(service.pendingAcceptor != address(0), "No pending acceptance");
        require(service.acceptedBy == address(0), "Service already accepted");
        require(service.completed == false, "Service already completed");

        address acceptor = service.pendingAcceptor;
        service.acceptedBy = acceptor;
        service.pendingAcceptor = address(0);
        
        acceptedServices[acceptor].push(_serviceId);

        uint256 tokenId = serviceNFT.mintServiceNFT{value: service.flowAmount}(
            _serviceId,
            service.requester,
            acceptor
        );
        
        service.nftTokenId = tokenId;

        console.log("Service acceptance approved:", _serviceId);
        console.log("NFT minted:", tokenId);

        emit ServiceAccepted(_serviceId, service.requester, acceptor, tokenId);
    }

    function rejectServiceAcceptance(uint256 _serviceId) public {
        require(_serviceId > 0 && _serviceId <= serviceCount, "Invalid service ID");
        Service storage service = services[_serviceId];
        require(service.requester == msg.sender, "Only requester can reject");
        require(service.pendingAcceptor != address(0), "No pending acceptance");

        address rejected = service.pendingAcceptor;
        service.pendingAcceptor = address(0);

        console.log("Service acceptance rejected:", _serviceId);
        console.log("Rejected acceptor:", rejected);

        emit ServiceAcceptanceRejected(_serviceId, msg.sender, rejected);
    }

    /**
     * NEW: Submit completion image (called by service provider)
     */
    function submitCompletionImage(uint256 _serviceId, string memory _completionImageHash) public {
        require(_serviceId > 0 && _serviceId <= serviceCount, "Invalid service ID");
        Service storage service = services[_serviceId];
        require(service.acceptedBy == msg.sender, "Only acceptor can submit completion");
        require(service.completed == false, "Service already completed");
        require(!service.completionSubmitted, "Completion already submitted");
        require(bytes(_completionImageHash).length > 0, "Completion image hash cannot be empty");

        service.completionImageHash = _completionImageHash;
        service.completionSubmitted = true;

        console.log("Completion image submitted for service:", _serviceId);
        console.log("Completion Image Hash:", _completionImageHash);

        emit CompletionImageSubmitted(_serviceId, msg.sender, _completionImageHash);
    }

    /**
     * MODIFIED: Complete service (now called by requester after verifying completion image)
     */
    function completeService(uint256 _serviceId) public {
        require(_serviceId > 0 && _serviceId <= serviceCount, "Invalid service ID");
        Service storage service = services[_serviceId];
        require(service.requester == msg.sender, "Only requester can complete");
        require(service.acceptedBy != address(0), "Service not accepted yet");
        require(service.completed == false, "Service already completed");
        require(service.nftTokenId > 0, "No NFT associated");
        require(service.completionSubmitted, "Completion image not submitted yet");

        service.completed = true;
        activeServicesCount[service.requester]--;

        serviceNFT.completeServiceAndBurn(service.nftTokenId);

        console.log("Service completed:", _serviceId);
        console.log("NFT burned:", service.nftTokenId);

        emit ServiceCompleted(_serviceId, service.requester, service.acceptedBy, service.nftTokenId);
    }
    
    function cancelService(uint256 _serviceId) public {
        require(_serviceId > 0 && _serviceId <= serviceCount, "Invalid service ID");
        Service storage service = services[_serviceId];
        require(service.requester == msg.sender, "Only requester can cancel");
        require(service.acceptedBy == address(0), "Cannot cancel accepted service");
        require(service.completed == false, "Service already completed");

        service.completed = true;
        activeServicesCount[msg.sender]--;

        (bool success, ) = msg.sender.call{value: service.flowAmount}("");
        require(success, "Refund failed");

        emit ServiceCancelled(_serviceId, msg.sender);
    }

    function getAllServiceIds() public view returns (uint256[] memory) {
        uint256[] memory ids = new uint256[](serviceCount);
        for (uint256 i = 1; i <= serviceCount; i++) {
            ids[i - 1] = i;
        }
        return ids;
    }
    
    function getActiveServiceIds() public view returns (uint256[] memory) {
        uint256 activeCount = 0;
        for (uint256 i = 1; i <= serviceCount; i++) {
            if (!services[i].completed) {
                activeCount++;
            }
        }
        
        uint256[] memory activeIds = new uint256[](activeCount);
        uint256 currentIndex = 0;
        for (uint256 i = 1; i <= serviceCount; i++) {
            if (!services[i].completed) {
                activeIds[currentIndex] = i;
                currentIndex++;
            }
        }
        
        return activeIds;
    }

    function getService(uint256 _serviceId) public view returns (Service memory) {
        require(_serviceId > 0 && _serviceId <= serviceCount, "Invalid service ID");
        return services[_serviceId];
    }

    function getServicesByRequester(address _requester) public view returns (uint256[] memory) {
        return requesterServices[_requester];
    }

    function getServicesByAccepter(address _accepter) public view returns (uint256[] memory) {
        return acceptedServices[_accepter];
    }

    receive() external payable {}
}
