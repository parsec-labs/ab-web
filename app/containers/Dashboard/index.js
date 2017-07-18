import React from 'react';
import PropTypes from 'prop-types';
import { createStructuredSelector } from 'reselect';
import { FormattedMessage } from 'react-intl';
import ethUtil from 'ethereumjs-util';
import BigNumber from 'bignumber.js';
import web3Connect from '../AccountProvider/web3Connect';
import { getWeb3 } from '../AccountProvider/sagas';
import { addEventsDate, isUserEvent } from '../AccountProvider/utils';
import { createBlocky } from '../../services/blockies';
import {
  ETH_DECIMALS,
  NTZ_DECIMALS,
  ABP_DECIMALS,
  formatEth,
  formatNtz,
  formatAbp,
} from '../../utils/amountFormatter';
import { modalAdd, modalDismiss } from '../App/actions';
import { contractEvents, accountLoaded, transferETH, proxyEvents } from '../AccountProvider/actions';
import makeSelectAccountData, { makeSignerAddrSelector, makeSelectPrivKey } from '../AccountProvider/selectors';
import {
  OVERVIEW,
  WALLET,
  EXCHANGE,
  setActiveTab,
} from './actions';
import messages from './messages';
import { getActiveTab, createDashboardTxsSelector } from './selectors';
import { Section, DBButton } from './styles';
import { txnsToList } from './txnsToList';
import TransferDialog from '../TransferDialog';

import Blocky from '../../components/Blocky';
import Container from '../../components/Container';
import H2 from '../../components/H2';
import Overview from '../../components/Dashboard/Overview';
import Wallet from '../../components/Dashboard/Wallet';
import Exchange from '../../components/Dashboard/Exchange';
import SubmitButton from '../../components/SubmitButton';
import WithLoading from '../../components/WithLoading';

import PanesRoot from '../../components/Dashboard/PanesRoot';
import Tabs from '../../components/Dashboard/Tabs';

import { ABI_TOKEN_CONTRACT, ABI_POWER_CONTRACT, ABI_ACCOUNT_FACTORY, ABI_PROXY, ABI_TABLE_FACTORY, conf } from '../../app.config';

const confParams = conf();

const LOOK_BEHIND_PERIOD = 4 * 60 * 24;

const PANES = {
  [OVERVIEW]: Overview,
  [WALLET]: Wallet,
  [EXCHANGE]: Exchange,
};

const TABS = [
  {
    name: OVERVIEW,
    title: <FormattedMessage {...messages[OVERVIEW]} />,
    icon: 'fa-tachometer',
  },
  {
    name: WALLET,
    title: <FormattedMessage {...messages[WALLET]} />,
    icon: 'fa-money',
  },
  {
    name: EXCHANGE,
    title: <FormattedMessage {...messages[EXCHANGE]} />,
    icon: 'fa-exchange',
  },
];

class DashboardRoot extends React.Component {
  constructor(props) {
    super(props);
    this.handleNTZTransfer = this.handleNTZTransfer.bind(this);
    this.handleNTZPurchase = this.handleNTZPurchase.bind(this);
    this.handleNTZSell = this.handleNTZSell.bind(this);
    this.handleETHTransfer = this.handleETHTransfer.bind(this);
    this.handlePowerUp = this.handlePowerUp.bind(this);
    this.handlePowerDown = this.handlePowerDown.bind(this);
    this.web3 = props.web3Redux.web3;

    this.token = this.web3.eth.contract(ABI_TOKEN_CONTRACT).at(confParams.ntzAddr);
    this.power = this.web3.eth.contract(ABI_POWER_CONTRACT).at(confParams.pwrAddr);
    this.tableFactory = this.web3.eth.contract(ABI_TABLE_FACTORY).at(confParams.tableFactory);

    this.tableFactory.getTables.call();
    if (this.props.account.proxy) {
      this.watchProxyEvents(this.props.account.proxy);
      this.watchTokenEvents(this.props.account.proxy);
      this.power.balanceOf.call(this.props.account.proxy);
    }
  }

  componentDidMount() {
    if (this.props.account && this.props.account.proxy === '0x') {
      this.watchAccountCreated();
    }
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.account.proxy === undefined && nextProps.account.proxy) {
      this.watchProxyEvents(nextProps.account.proxy);
      this.watchTokenEvents(nextProps.account.proxy);
      this.power.balanceOf.call(nextProps.account.proxy);
    }

    if (this.props.dashboardTxs.txError !== nextProps.dashboardTxs.txError && nextProps.dashboardTxs.txError) {
      this.props.modalAdd(
        <div>
          <H2>
            <FormattedMessage {...messages.transactionErrorTitle} />
          </H2>
          <p>{nextProps.dashboardTxs.txError}</p>
          <SubmitButton
            onClick={() => {
              this.props.dispatch(nextProps.dashboardTxs.failedTxAction);
              this.props.modalDismiss();
            }}
          >
            <FormattedMessage {...messages.retryTransaction} />
          </SubmitButton>
        </div>
      );
    }

    // Note: listen to AccountFactory's AccountCreated Event if proxy address is not ready
    if (nextProps.account && this.props
        && nextProps.account.proxy !== this.props.account.proxy
        && nextProps.account.proxy === '0x') {
      this.watchAccountCreated();
    }
  }

  watchProxyEvents(proxyAddr) {
    const web3 = getWeb3();
    this.proxy = web3.eth.contract(ABI_PROXY).at(proxyAddr);

    this.web3.eth.getBlockNumber((err, blockNumber) => {
      this.proxy.allEvents({
        fromBlock: blockNumber - LOOK_BEHIND_PERIOD,
        toBlock: 'latest',
      }).get((error, eventList) => {
        addEventsDate(eventList.filter(isUserEvent(proxyAddr)))
          .then((events) => this.props.proxyEvents(events, proxyAddr));
      });
    });

    this.proxy.allEvents({
      toBlock: 'latest',
    }).watch((error, event) => {
      if (!error && event) {
        addEventsDate([event])
          .then((events) => this.props.proxyEvents(events, proxyAddr));
        this.web3.eth.getBalance(proxyAddr);
      }
    });
  }

  watchTokenEvents(proxyAddr) {
    this.token.floor.call();
    this.token.ceiling.call();
    this.token.powerAddr.call();
    this.token.balanceOf.call(proxyAddr);
    this.web3.eth.getBalance(proxyAddr);

    this.web3.eth.getBlockNumber((err, blockNumber) => {
      this.token.allEvents({
        fromBlock: blockNumber - LOOK_BEHIND_PERIOD,
        toBlock: 'latest',
      }).get((error, eventList) => {
        addEventsDate(eventList.filter(isUserEvent(proxyAddr)))
          .then((events) => this.props.contractEvents(events, proxyAddr));
      });
    });

    this.token.allEvents({
      toBlock: 'latest',
    }).watch((watchError, event) => {
      if (!watchError && isUserEvent(proxyAddr)(event)) {
        this.power.balanceOf.call(proxyAddr);
        this.token.balanceOf.call(proxyAddr);
        this.web3.eth.getBalance(proxyAddr);
        const { pendingSell = [] } = this.props.dashboardTxs;

        if (pendingSell.indexOf(event.transactionHash) > -1) {
          this.token.transferFrom.sendTransaction(
            confParams.ntzAddr,
            proxyAddr,
            0,
            { from: proxyAddr }
          );
        }
      }
    });

    // Check if we have unfinished sell
    this.token.allowance.callPromise(
      confParams.ntzAddr,
      proxyAddr,
    ).then((value) => {
      if (!value.eq(0)) {
        this.token.transferFrom.sendTransaction(
          confParams.ntzAddr,
          proxyAddr,
          0,
          { from: proxyAddr }
        );
      }
    });
  }

  watchAccountCreated() {
    const web3 = getWeb3();
    const privKey = this.props.privKey;
    const privKeyBuffer = new Buffer(privKey.replace('0x', ''), 'hex');
    const signer = `0x${ethUtil.privateToAddress(privKeyBuffer).toString('hex')}`;
    const accountFactory = web3.eth.contract(ABI_ACCOUNT_FACTORY).at(confParams.accountFactory);
    const events = accountFactory.AccountCreated({ signer }, { fromBlock: 'latest' });

    events.watch((err, ev) => {  // eslint-disable-line no-unused-vars
      accountFactory.getAccount.call(signer, (e, res) => {
        const proxy = res[0];
        const controller = res[1];
        const lastNonce = res[2].toNumber();

        this.props.accountLoaded({ proxy, controller, lastNonce });
      });

      events.stopWatching();
    });
  }

  handleNTZTransfer(amount, to) {
    this.token.transfer.sendTransaction(
      to,
      new BigNumber(amount).mul(NTZ_DECIMALS)
    );
    this.props.modalDismiss();
  }

  handleNTZPurchase(amount) {
    this.props.transferETH({
      dest: confParams.ntzAddr,
      amount: new BigNumber(amount).mul(ETH_DECIMALS),
    });
    this.props.modalDismiss();
  }

  handleNTZSell(amount) {
    this.token.transfer.sendTransaction(
      confParams.ntzAddr,
      new BigNumber(amount).mul(NTZ_DECIMALS),
      { from: this.props.account.proxy }
    );
    this.props.modalDismiss();
  }

  handleETHTransfer(amount, dest) {
    this.props.transferETH({
      dest,
      amount: new BigNumber(amount).mul(ETH_DECIMALS),
    });
    this.props.modalDismiss();
  }

  handlePowerUp(amount) {
    this.token.transfer.sendTransaction(
      confParams.pwrAddr,
      new BigNumber(amount).mul(NTZ_DECIMALS)
    );
    this.props.modalDismiss();
  }

  handlePowerDown(amount) {
    this.power.transfer.sendTransaction(
      confParams.ntzAddr,
      new BigNumber(amount).mul(ABP_DECIMALS)
    );
    this.props.modalDismiss();
  }
  render() {
    const weiBalance = this.web3.eth.balance(this.props.account.proxy);
    const floor = this.token.floor();
    const ceiling = this.token.ceiling();
    const babzBalance = this.token.balanceOf(this.props.account.proxy);
    const pwrBalance = this.power.balanceOf(this.props.account.proxy);
    const tables = this.tableFactory.getTables();

    const listTxns = txnsToList(
      this.props.dashboardTxs.dashboardEvents,
      tables,
      this.props.account.proxy
    );
    return (
      <Container>
        <Tabs tabs={TABS} {...this.props} />
        <PanesRoot
          panes={PANES}
          paneType={this.props.activeTab}
          paneProps={{
            weiBalance,
            floor,
            ceiling,
            babzBalance,
            pwrBalance,
            listTxns,
            handleNTZSell: this.handleNTZSell,
            handleNTZPurchase: this.handleNTZPurchase,
            handlePowerDown: this.handlePowerDown,
            handlePowerUp: this.handlePowerUp,
            ...this.props,
          }}
        />
        <Section name="player-info">
          <Blocky blocky={createBlocky(this.props.signerAddr)} />
        </Section>

        <Section name="nutz">
          <h2>Nutz</h2>
          <p>
            <span>Balance: </span>
            <WithLoading
              isLoading={!babzBalance}
              loadingSize="14px"
              type="inline"
              styles={{ layout: { marginLeft: '15px' } }}
            >
              <span>{babzBalance && formatNtz(babzBalance)} NTZ</span>
            </WithLoading>
          </p>
          {babzBalance &&
            <DBButton
              onClick={() => {
                this.props.modalAdd(
                  <TransferDialog
                    title={<FormattedMessage {...messages.ntzTransferTitle} />}
                    handleTransfer={this.handleNTZTransfer}
                    maxAmount={babzBalance.div(NTZ_DECIMALS)}
                    amountUnit="NTZ"
                  />
                );
              }}
              size="medium"
              icon="fa fa-money"
            >
              Transfer
            </DBButton>
          }
        </Section>

        <Section name="ether">
          <h2>Ether</h2>
          <p>
            <span>Balance: </span>
            <WithLoading
              isLoading={!weiBalance}
              loadingSize="14px"
              type="inline"
              styles={{ layout: { marginLeft: '15px' } }}
            >
              <span>{weiBalance && formatEth(weiBalance)} ETH</span>
            </WithLoading>
          </p>
          {weiBalance &&
            <DBButton
              onClick={() => {
                this.props.modalAdd(
                  <TransferDialog
                    title={<FormattedMessage {...messages.ethTransferTitle} />}
                    handleTransfer={this.handleETHTransfer}
                    maxAmount={weiBalance.div(ETH_DECIMALS)}
                    amountUnit="ETH"
                  />
                );
              }}
              size="medium"
              icon="fa fa-money"
            >
              Transfer
            </DBButton>
          }
        </Section>

        <Section name="power">
          <h2>Power</h2>
          <p>
            <span>Balance: </span>
            <WithLoading
              isLoading={!pwrBalance}
              loadingSize="14px"
              type="inline"
              styles={{ layout: { marginLeft: '15px' } }}
            >
              <span>{pwrBalance && formatAbp(pwrBalance)} ABP</span>
            </WithLoading>
          </p>
        </Section>
      </Container>
    );
  }
}
DashboardRoot.propTypes = {
  activeTab: PropTypes.string,
  account: PropTypes.object,
  accountLoaded: PropTypes.func,
  contractEvents: PropTypes.func,
  dashboardTxs: PropTypes.object,
  dispatch: PropTypes.func,
  modalAdd: PropTypes.func,
  modalDismiss: PropTypes.func,
  privKey: PropTypes.string,
  proxyEvents: PropTypes.func,
  transferETH: PropTypes.func,
  signerAddr: PropTypes.string,
  web3Redux: PropTypes.any,
};

const mapDispatchToProps = (dispatch) => ({
  setActiveTab: (whichTab) => dispatch(setActiveTab(whichTab)),
  modalAdd,
  modalDismiss,
  transferETH,
  proxyEvents,
  contractEvents,
  accountLoaded,
});

const mapStateToProps = createStructuredSelector({
  activeTab: getActiveTab(),
  account: makeSelectAccountData(),
  dashboardTxs: createDashboardTxsSelector(),
  signerAddr: makeSignerAddrSelector(),
  privKey: makeSelectPrivKey(),
});

export default web3Connect(
  mapStateToProps,
  mapDispatchToProps,
)(DashboardRoot);
