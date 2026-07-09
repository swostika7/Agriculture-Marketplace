/**
 * LanguageContext.js
 * Bilingual support: English (en) and Nepali (ne)
 * Used via: const { t, lang, setLang } = useLanguage()
 */
import React, { createContext, useContext, useState, useEffect } from 'react';

const translations = {
  en: {
    // Nav & Common
    dashboard:       'Dashboard',
    marketplace:     'Marketplace',
    myFarm:          'My Farm',
    logistics:       'Logistics',
    profile:         'Profile',
    signOut:         'Sign Out',
    signIn:          'Sign In',
    register:        'Create Account',
    loading:         'Loading…',
    save:            'Save Changes',
    cancel:          'Cancel',
    delete:          'Delete',
    edit:            'Edit',
    submit:          'Submit',
    close:           'Close',
    back:            'Back',
    search:          'Search',
    filter:          'Filter',
    sort:            'Sort',
    all:             'All',
    yes:             'Yes',
    no:              'No',
    // Marketplace
    freshMarketplace:'Fresh Marketplace',
    browseProducts:  'Browse fresh produce from local farmers',
    nearbyFirst:     'Nearby First',
    addToCart:       'Add to Cart',
    buyNow:          'Buy Now',
    viewCart:        'View Cart',
    cart:            'Cart',
    checkout:        'Checkout',
    emptyCart:       'Your cart is empty',
    cartTotal:       'Cart Total',
    removeItem:      'Remove',
    placeOrder:      'Place Order',
    cartAdded:       'Added to cart!',
    qty:             'Qty',
    available:       'available',
    distanceAway:    'km away',
    nearby:          'Nearby',
    popular:         'Popular',
    sale:            'SALE',
    // Farmer Dashboard
    farmerDashboard: 'Farmer Dashboard',
    newListing:      'New Listing',
    myProducts:      'My Products',
    insights:        'Insights',
    cropName:        'Crop Name',
    category:        'Category',
    quantity:        'Quantity',
    unit:            'Unit',
    price:           'Price',
    season:          'Season',
    description:     'Description',
    farmLocation:    'Farm Location',
    publishListing:  'Publish Listing',
    updateListing:   'Update Listing',
    aiSuggestedPrice:'AI Suggested Price',
    activeListings:  'Active Listings',
    pendingOrders:   'Pending Orders',
    paidRevenue:     'Paid Revenue',
    // Orders
    orders:          'Orders',
    myOrders:        'My Orders',
    orderPlaced:     'Order Placed',
    inTransit:       'In Transit',
    delivered:       'Delivered',
    cancelled:       'Cancelled',
    pending:         'Pending',
    status:          'Status',
    totalPrice:      'Total Price',
    // Reviews
    reviews:         'Reviews',
    writeReview:     'Write a Review',
    yourRating:      'Your Rating',
    yourReview:      'Your Review (optional)',
    submitReview:    'Submit Review',
    noReviews:       'No reviews yet. Be the first!',
    reviewPosted:    'Review posted successfully!',
    // Chat
    chat:            'Chat',
    messages:        'Messages',
    conversations:   'Conversations',
    typeMessage:     'Type a message…',
    sendMessage:     'Send',
    noConversations: 'No conversations yet',
    startChat:       'Chat with Farmer',
    // Notifications
    notifications:   'Notifications',
    noNotifications: 'No new notifications',
    markAllRead:     'Mark all as read',
    // Profile
    personalInfo:    'Personal Info',
    security:        'Security',
    activity:        'Activity',
    changePassword:  'Change Password',
    language:        'Language',
    // Auth
    emailAddress:    'Email Address',
    password:        'Password',
    fullName:        'Full Name',
    iAmA:            'I am a…',
    farmer:          'Farmer',
    consumer:        'Consumer',
    yourCity:        'Your City',
    // Logistics
    deliveryRoutes:  'Delivery & Routes',
    routePlanner:    'Route Planner',
    incomingOrders:  'Incoming Orders',
    shipOrder:       'Ship',
    markDelivered:   'Mark Delivered',
    viewRoute:       'View Route',
    estimatedTime:   'Estimated Time',
    roadDistance:    'Road Distance',
  },
  ne: {
    // Nav & Common
    dashboard:       'ड्यासबोर्ड',
    marketplace:     'बजार',
    myFarm:          'मेरो खेत',
    logistics:       'ढुवानी',
    profile:         'प्रोफाइल',
    signOut:         'बाहिर निस्कनुस्',
    signIn:          'साइन इन',
    register:        'खाता बनाउनुस्',
    loading:         'लोड हुँदैछ…',
    save:            'परिवर्तन सेव गर्नुस्',
    cancel:          'रद्द गर्नुस्',
    delete:          'मेटाउनुस्',
    edit:            'सम्पादन',
    submit:          'पेश गर्नुस्',
    close:           'बन्द गर्नुस्',
    back:            'पछाडि',
    search:          'खोज्नुस्',
    filter:          'फिल्टर',
    sort:            'क्रम',
    all:             'सबै',
    yes:             'हो',
    no:              'होइन',
    // Marketplace
    freshMarketplace:'ताजा बजार',
    browseProducts:  'स्थानीय किसानको ताजा उत्पादन हेर्नुस्',
    nearbyFirst:     'नजिकको पहिले',
    addToCart:       'कार्टमा थप्नुस्',
    buyNow:          'अहिले किन्नुस्',
    viewCart:        'कार्ट हेर्नुस्',
    cart:            'कार्ट',
    checkout:        'भुक्तानी गर्नुस्',
    emptyCart:       'तपाईंको कार्ट खाली छ',
    cartTotal:       'कार्ट जम्मा',
    removeItem:      'हटाउनुस्',
    placeOrder:      'अर्डर गर्नुस्',
    cartAdded:       'कार्टमा थपियो!',
    qty:             'मात्रा',
    available:       'उपलब्ध',
    distanceAway:    'किमी टाढा',
    nearby:          'नजिकै',
    popular:         'लोकप्रिय',
    sale:            'छुट',
    // Farmer Dashboard
    farmerDashboard: 'किसान ड्यासबोर्ड',
    newListing:      'नयाँ सूची',
    myProducts:      'मेरा उत्पादनहरू',
    insights:        'विश्लेषण',
    cropName:        'बालीको नाम',
    category:        'श्रेणी',
    quantity:        'मात्रा',
    unit:            'इकाई',
    price:           'मूल्य',
    season:          'मौसम',
    description:     'विवरण',
    farmLocation:    'खेतको स्थान',
    publishListing:  'सूची प्रकाशित गर्नुस्',
    updateListing:   'सूची अपडेट गर्नुस्',
    aiSuggestedPrice:'AI सुझावित मूल्य',
    activeListings:  'सक्रिय सूचीहरू',
    pendingOrders:   'विचाराधीन अर्डरहरू',
    paidRevenue:     'प्राप्त आम्दानी',
    // Orders
    orders:          'अर्डरहरू',
    myOrders:        'मेरा अर्डरहरू',
    orderPlaced:     'अर्डर भयो',
    inTransit:       'बाटोमा छ',
    delivered:       'डेलिभर भयो',
    cancelled:       'रद्द भयो',
    pending:         'विचाराधीन',
    status:          'स्थिति',
    totalPrice:      'जम्मा मूल्य',
    // Reviews
    reviews:         'समीक्षाहरू',
    writeReview:     'समीक्षा लेख्नुस्',
    yourRating:      'तपाईंको मूल्यांकन',
    yourReview:      'तपाईंको समीक्षा (वैकल्पिक)',
    submitReview:    'समीक्षा पेश गर्नुस्',
    noReviews:       'अहिलेसम्म कुनै समीक्षा छैन।',
    reviewPosted:    'समीक्षा सफलतापूर्वक पोस्ट भयो!',
    // Chat
    chat:            'च्याट',
    messages:        'सन्देशहरू',
    conversations:   'कुराकानीहरू',
    typeMessage:     'सन्देश टाइप गर्नुस्…',
    sendMessage:     'पठाउनुस्',
    noConversations: 'अहिलेसम्म कुनै कुराकानी छैन',
    startChat:       'किसानसँग च्याट गर्नुस्',
    // Notifications
    notifications:   'सूचनाहरू',
    noNotifications: 'नयाँ सूचना छैन',
    markAllRead:     'सबै पढेको चिन्ह लगाउनुस्',
    // Profile
    personalInfo:    'व्यक्तिगत जानकारी',
    security:        'सुरक्षा',
    activity:        'गतिविधि',
    changePassword:  'पासवर्ड परिवर्तन गर्नुस्',
    language:        'भाषा',
    // Auth
    emailAddress:    'इमेल ठेगाना',
    password:        'पासवर्ड',
    fullName:        'पूरा नाम',
    iAmA:            'म एक हुँ…',
    farmer:          'किसान',
    consumer:        'उपभोक्ता',
    yourCity:        'तपाईंको शहर',
    // Logistics
    deliveryRoutes:  'ढुवानी र मार्गहरू',
    routePlanner:    'मार्ग योजनाकार',
    incomingOrders:  'आउँदा अर्डरहरू',
    shipOrder:       'पठाउनुस्',
    markDelivered:   'डेलिभर भयो',
    viewRoute:       'मार्ग हेर्नुस्',
    estimatedTime:   'अनुमानित समय',
    roadDistance:    'सडक दूरी',
  },
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() =>
    localStorage.getItem('agri_lang') || 'en'
  );

  const setLang = (l) => {
    setLangState(l);
    localStorage.setItem('agri_lang', l);
  };

  const t = (key) => translations[lang]?.[key] || translations.en[key] || key;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, translations }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be within LanguageProvider');
  return ctx;
};
