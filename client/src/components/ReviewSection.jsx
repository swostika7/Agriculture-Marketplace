import React, { useState, useEffect } from 'react';
import { MdStar, MdStarBorder, MdStarHalf, MdRateReview } from 'react-icons/md';
import { reviewsAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { npr } from '../utils/currency';

function StarRating({ value, onChange, readonly = false, size = 24 }) {
  const [hover, setHover] = useState(0);
  const stars = [1, 2, 3, 4, 5];
  return (
    <div className="flex gap-1">
      {stars.map(star => {
        const filled = readonly ? value >= star : (hover || value) >= star;
        return (
          <button
            key={star}
            type="button"
            disabled={readonly}
            onClick={() => !readonly && onChange && onChange(star)}
            onMouseEnter={() => !readonly && setHover(star)}
            onMouseLeave={() => !readonly && setHover(0)}
            className={`transition-colors ${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110 transition-transform'}`}
          >
            {filled
              ? <MdStar size={size} className="text-harvest-400"/>
              : <MdStarBorder size={size} className="text-earth-300"/>}
          </button>
        );
      })}
    </div>
  );
}

function ReviewCard({ review }) {
  return (
    <div className="bg-earth-50 rounded-xl p-4 border border-earth-100">
      <div className="flex items-start gap-3 mb-3">
        {review.reviewerID?.avatar
          ? <img src={review.reviewerID.avatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0"/>
          : <div className="w-8 h-8 rounded-full bg-leaf-200 flex items-center justify-center text-leaf-700 font-bold text-sm shrink-0">
              {review.reviewerID?.name?.[0]?.toUpperCase()||'?'}
            </div>}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-earth-800 text-sm font-body">{review.reviewerID?.name || 'Anonymous'}</span>
            <span className="text-xs text-earth-400 font-body">{new Date(review.createdAt).toLocaleDateString('en-NP')}</span>
          </div>
          <StarRating value={review.rating} readonly size={16}/>
        </div>
      </div>
      {review.comment && <p className="text-sm font-body text-earth-600 leading-relaxed">{review.comment}</p>}
    </div>
  );
}

export function ReviewSection({ productID, farmerID, avgRating = 0, reviewCount = 0 }) {
  const { user }  = useAuth();
  const { t }     = useLanguage();
  const [reviews,   setReviews]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [rating,    setRating]    = useState(5);
  const [comment,   setComment]   = useState('');
  const [submitting,setSubmitting]= useState(false);
  const [msg,       setMsg]       = useState('');

  useEffect(() => {
    if (!productID) return;
    reviewsAPI.getByProduct(productID)
      .then(({ data }) => setReviews(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [productID]);

  const submitReview = async () => {
    setSubmitting(true);
    try {
      const { data } = await reviewsAPI.submit({ productID, rating, comment });
      setReviews(prev => [data, ...prev]);
      setMsg(t('reviewPosted'));
      setShowForm(false);
      setComment('');
      setRating(5);
    } catch(e) {
      setMsg('❌ ' + (e.response?.data?.message || 'Failed to submit review'));
    } finally { setSubmitting(false); }
  };

  const canReview = user && user.role !== 'Farmer' && productID;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display font-semibold text-earth-800 text-lg flex items-center gap-2">
            <MdStar className="text-harvest-400" size={22}/> {t('reviews')}
          </h3>
          {reviewCount > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <StarRating value={Math.round(avgRating)} readonly size={16}/>
              <span className="text-sm font-body text-earth-600">
                <span className="font-bold text-earth-800">{avgRating.toFixed(1)}</span> / 5 ({reviewCount} {reviewCount===1?'review':'reviews'})
              </span>
            </div>
          )}
        </div>
        {canReview && !showForm && (
          <button onClick={() => setShowForm(true)} className="btn-secondary text-sm py-2 flex items-center gap-2">
            <MdRateReview size={16}/> {t('writeReview')}
          </button>
        )}
      </div>

      {msg && (
        <div className={`mb-4 p-3 rounded-xl text-sm font-body border ${msg.startsWith('❌')?'bg-red-50 border-red-200 text-red-600':'bg-leaf-50 border-leaf-200 text-leaf-700'}`}>
          {msg}
        </div>
      )}

      {showForm && (
        <div className="card mb-4 animate-slide-up">
          <h4 className="font-display font-semibold text-earth-800 mb-4">{t('writeReview')}</h4>
          <div className="mb-4">
            <label className="label">{t('yourRating')}</label>
            <StarRating value={rating} onChange={setRating} size={32}/>
          </div>
          <div className="mb-4">
            <label className="label">{t('yourReview')}</label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="Share your experience with this product…"
              value={comment}
              onChange={e => setComment(e.target.value)}
              maxLength={500}
            />
          </div>
          <div className="flex gap-3">
            <button onClick={submitReview} disabled={submitting} className="btn-primary">
              {submitting ? <span className="spinner" style={{width:16,height:16,borderWidth:2}}/> : <MdStar size={16}/>}
              {t('submitReview')}
            </button>
            <button onClick={() => { setShowForm(false); setMsg(''); }} className="btn-secondary">
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><div className="spinner"/></div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-8 text-earth-400">
          <MdStarBorder size={36} className="mx-auto mb-2 opacity-40"/>
          <p className="text-sm font-body">{t('noReviews')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map(r => <ReviewCard key={r._id} review={r}/>)}
        </div>
      )}
    </div>
  );
}

export { StarRating };
