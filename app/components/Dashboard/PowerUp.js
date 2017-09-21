import React from 'react';
import PropTypes from 'prop-types';
import BigNumber from 'bignumber.js';
import { FormattedMessage, FormattedHTMLMessage } from 'react-intl';

import { formatAmount, toNtz, ABP_DECIMALS, NTZ_DECIMALS } from '../../utils/amountFormatter';

import { ABP, NTZ } from '../../containers/Dashboard/actions';
import ExchangeDialog from '../../containers/ExchangeDialog';

import FormField from '../Form/FormField';
import Alert from '../Alert';
import BtnUpgrade from '../Dashboard/BtnUpgrade';

import { Description } from './styles';

const PowerUp = (props) => {
  const {
    messages,
    account,
    nutzBalance,
    handlePowerUp,
    totalSupplyPwr,
    totalSupplyBabz,
    activeSupplyPwr,
  } = props;
  const adjustmentFactor = (amount) => amount.mul(2);
  const calcNTZtoABP = (amount) => {
    const ntzAmount = new BigNumber(amount);
    const abpAmount = totalSupplyPwr.mul(ntzAmount.div(totalSupplyBabz));
    const adjustedAbp = adjustmentFactor(abpAmount);
    return adjustedAbp.toFormat(2);
  };
  const totalAvailPwr = totalSupplyPwr.minus(activeSupplyPwr);
  const powerUpRate = totalSupplyBabz.div(adjustmentFactor(totalSupplyPwr));
  const powerUpMaxNtz = toNtz(totalAvailPwr.mul(totalSupplyBabz.div(totalSupplyPwr)));
  const powerUpMinNtz = totalSupplyBabz.div(NTZ_DECIMALS.mul(10000));
  return (
    <div>
      <Description>
        <FormattedHTMLMessage {...messages.powerUpDescr} />
        <Alert theme="info" style={{ textAlign: 'center' }}>
          <FormattedMessage
            {...messages.powerUpAvailable}
            values={{ amount: formatAmount(ABP_DECIMALS, totalAvailPwr, 0) }}
          />
        </Alert>
        <Alert theme="info" style={{ textAlign: 'center' }}>
          <FormattedMessage
            {...messages.powerUpRate}
            values={{ amount: powerUpRate.toFormat(0) }}
          />
        </Alert>
        <Alert theme="info" style={{ textAlign: 'center' }}>
          <FormattedMessage
            {...messages.powerUpMinAmount}
            values={{ amount: powerUpMinNtz.toFormat(0) }}
          />
        </Alert>
      </Description>
      {!account.isLocked ?
        <ExchangeDialog
          form="exchangeNTZtoABP"
          handleExchange={handlePowerUp}
          maxAmount={nutzBalance || powerUpMaxNtz}
          minAmount={powerUpMinNtz}
          label={<FormattedMessage {...messages.powerUpAmountLabel} />}
          hideAddress
          amountUnit={NTZ}
          placeholder="0"
          calcExpectedAmount={calcNTZtoABP}
          expectedAmountUnit={ABP}
          component={FormField}
          {...props}
        />
        :
        <Alert theme="warning">
          <BtnUpgrade {...props} /> to Power Up.
        </Alert>
      }
    </div>
  );
};
PowerUp.propTypes = {
  account: PropTypes.object,
  nutzBalance: PropTypes.object,
  messages: PropTypes.object.isRequired,
  handlePowerUp: PropTypes.func,
  totalSupplyPwr: PropTypes.object.isRequired,
  totalSupplyBabz: PropTypes.object.isRequired,
  activeSupplyPwr: PropTypes.object.isRequired,
};

export default PowerUp;
