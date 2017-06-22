import React, { PropTypes } from 'react';
import QRCode from 'qrcode.react';
import { FormattedMessage } from 'react-intl';
import { createStructuredSelector } from 'reselect';
import ethUtil from 'ethereumjs-util';
import BigNumber from 'bignumber.js';

import { getWeb3 } from '../AccountProvider/sagas';
import makeSelectAccountData, { makeSignerAddrSelector, makeSelectPrivKey } from '../AccountProvider/selectors';
import messages from './messages';
import { modalAdd, modalDismiss } from '../App/actions';
import web3Connect from '../AccountProvider/web3Connect';
import { contractEvent, accountLoaded, transferETH, claimETH, proxyEvent } from '../AccountProvider/actions';
import { createBlocky } from '../../services/blockies';
import { ABI_TOKEN_CONTRACT, ABI_ACCOUNT_FACTORY, ABI_PROXY, conf } from '../../app.config';

import List from '../../components/List';
import Alert from '../../components/Alert';
import TransferDialog from '../TransferDialog';
import PurchaseDialog from '../PurchaseDialog';
import SellDialog from '../SellDialog';
import Container from '../../components/Container';
import Button from '../../components/Button';
import Blocky from '../../components/Blocky';
// import FormGroup from '../../components/Form/FormGroup';
import WithLoading from '../../components/WithLoading';

import { Section } from './styles';

const confParams = conf();
// ether units: https://github.com/ethereum/web3.js/blob/0.15.0/lib/utils/utils.js#L40
const ethDecimals = new BigNumber(10).pow(18);
// acebuster units:
// 1 x 10^12 - Nutz   (NTZ)
// 1 x 10^9 - Jonyz
// 1 x 10^6 - Helcz
// 1 x 10^3 - Pascalz
// 1 x 10^0 - Babz
const ntzDecimals = new BigNumber(10).pow(12);

const LOOK_BEHIND_PERIOD = 4 * 60 * 24;

export class Dashboard extends React.Component { // eslint-disable-line react/prefer-stateless-function

  constructor(props) {
    super(props);
    this.handleNTZTransfer = this.handleNTZTransfer.bind(this);
    this.handleNTZPurchase = this.handleNTZPurchase.bind(this);
    this.handleNTZSell = this.handleNTZSell.bind(this);
    this.handleETHTransfer = this.handleETHTransfer.bind(this);
    this.web3 = props.web3Redux.web3;

    this.token = this.web3.eth.contract(ABI_TOKEN_CONTRACT).at(confParams.ntzAddr);

    if (this.props.account.proxy) {
      this.web3.eth.getBalance(this.props.account.proxy);
      this.watchProxyEvents(this.props.account.proxy);
      this.watchTokenEvents(this.props.account.proxy);
    }
  }

  componentDidMount() {
    if (this.props.account && this.props.account.proxy === '0x') {
      this.watchAccountCreated();
    }
  }

  componentWillReceiveProps(nextProps) {
    const balance = this.token.balanceOf(nextProps.account.proxy);
    if (!balance && nextProps.account.proxy) {
      this.token.balanceOf.call(nextProps.account.proxy);
    }

    const floor = this.token.floor();
    if (!floor) {
      this.token.floor.call();
    }

    if (this.props.account.proxy === undefined && nextProps.account.proxy) {
      this.web3.eth.getBalance(nextProps.account.proxy);
      this.watchProxyEvents(nextProps.account.proxy);
      this.watchTokenEvents(nextProps.account.proxy);
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
      this.proxy.Received({ fromBlock: blockNumber - LOOK_BEHIND_PERIOD, toBlock: 'latest' }).watch((error, event) => {
        if (!error && event) {
          this.props.proxyEvent(event);
          this.web3.eth.getBalance(proxyAddr);
        }
      });
    });
  }

  watchTokenEvents(proxyAddr) {
    this.web3.eth.getBlockNumber((err, blockNumber) => {
      const events = this.token.allEvents({ fromBlock: blockNumber - LOOK_BEHIND_PERIOD, toBlock: 'latest' });
      events.get((error, eventList) => {
        eventList
          .filter(({ args = {} }) => args.from === proxyAddr || args.to === proxyAddr)
          .forEach(this.props.contractEvent);

        events.watch((watchError, event) => {
          const { pendingSell = [] } = this.props.account;
          if (pendingSell.indexOf(event.transactionHash) > -1) {
            this.token.transferFrom.sendTransaction(
              confParams.ntzAddr,
              this.props.account.proxy,
              0,
              { from: this.props.account.proxy }
            );
            this.props.claimETH(event.transactionHash);
          }
          if (!watchError && this.props.account.proxy) {
            this.token.balanceOf.call(this.props.account.proxy);
            this.web3.eth.getBalance(this.props.account.proxy);
          }
        });
      });
    });

    // Check if we have unfinished sell
    this.token.allowance.callPromise(
      confParams.ntzAddr,
      proxyAddr,
    ).then((value) => {
      if (!value.eq(0)) {
        this.token.transferFrom.sendTransaction(
          confParams.ntzAddr,
          this.props.account.proxy,
          0,
          { from: this.props.account.proxy }
        );
      }
    });
  }

  handleNTZTransfer(to, amount) {
    this.token.transfer.sendTransaction(
      to,
      new BigNumber(amount).mul(ntzDecimals)
    );
    this.props.modalDismiss();
  }

  handleNTZPurchase(amount) {
    this.props.transferETH({
      dest: confParams.ntzAddr,
      amount: new BigNumber(amount).mul(ethDecimals),
    });
    this.props.modalDismiss();
  }

  handleNTZSell(amount) {
    this.token.transfer.sendTransaction(
      confParams.ntzAddr,
      new BigNumber(amount).mul(ntzDecimals),
      { from: this.props.account.proxy }
    );
    this.props.modalDismiss();
  }

  handleETHTransfer(dest, amount) {
    this.props.transferETH({
      dest,
      amount: new BigNumber(amount).mul(ethDecimals),
    });
    this.props.modalDismiss();
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

  render() {
    const qrUrl = `ether:${this.props.account.proxy}`;
    const weiBalance = this.web3.eth.balance(this.props.account.proxy);
    const ethBalance = weiBalance && weiBalance.div(ethDecimals);
    const floor = this.token.floor();
    const babBalance = this.token.balanceOf(this.props.account.proxy);
    const ntzBalance = babBalance && babBalance.div(ntzDecimals);

    const listPending = pendingToList(this.props.account.pending);

    let listTxns = null;
    if (this.props.account[confParams.ntzAddr]) {
      listTxns = txnsToList(this.props.account[confParams.ntzAddr].transactions, this.props.account.proxy);
    }

    return (
      <Container>
        <h1><FormattedMessage {...messages.header} /></h1>

        <Section>
          <Blocky blocky={createBlocky(this.props.signerAddr)} />
          <h3>Your address:</h3>

          <WithLoading
            isLoading={!this.props.account.proxy || this.props.account.proxy === '0x'}
            loadingSize="40px"
            styles={{ layout: { transform: 'translateY(-50%)', left: 0 } }}
          >
            <p> { this.props.account.proxy } </p>
            <QRCode value={qrUrl} size={120} />

            <Alert theme="danger">
              <FormattedMessage {...messages.ethAlert} />
            </Alert>
          </WithLoading>

        </Section>

        <Section>
          <h2>Nutz</h2>
          <p>
            <span>Balance: </span>
            <WithLoading
              isLoading={!ntzBalance}
              loadingSize="14px"
              type="inline"
              styles={{ layout: { marginLeft: '15px' } }}
            >
              <span>{ntzBalance && ntzBalance.toString()} NTZ</span>
            </WithLoading>
          </p>
          {ntzBalance &&
            <Button
              align="left"
              onClick={() => {
                this.props.modalAdd(
                  <TransferDialog
                    handleTransfer={this.handleNTZTransfer}
                    maxAmount={ntzBalance}
                    amountUnit="NTZ"
                  />
                );
              }}
              size="medium"
              icon="fa fa-money"
            >
              TRANSFER
            </Button>
          }
          {ntzBalance && floor &&
            <Button
              align="left"
              onClick={() => {
                this.props.modalAdd(
                  <SellDialog
                    handleSell={this.handleNTZSell}
                    maxAmount={ntzBalance}
                    floorPrice={floor}
                  />
                );
              }}
              size="medium"
              icon="fa fa-money"
            >
              SELL
            </Button>
          }
        </Section>

        <Section>
          <h2>Ether</h2>
          <p>
            <span>Balance: </span>
            <WithLoading
              isLoading={!ethBalance}
              loadingSize="14px"
              type="inline"
              styles={{ layout: { marginLeft: '15px' } }}
            >
              <span>{ethBalance && ethBalance.toString()} ETH</span>
            </WithLoading>
          </p>
          {ethBalance &&
            <Button
              align="left"
              onClick={() => {
                this.props.modalAdd(
                  <TransferDialog
                    handleTransfer={this.handleETHTransfer}
                    maxAmount={ethBalance}
                    amountUnit="ETH"
                  />
                );
              }}
              size="medium"
              icon="fa fa-money"
            >
              TRANSFER
            </Button>
          }
          {ethBalance &&
            <Button
              align="left"
              onClick={() => {
                this.props.modalAdd(
                  <PurchaseDialog
                    handlePurchase={this.handleNTZPurchase}
                  />
                );
              }}
              size="medium"
              icon="fa fa-money"
            >
              PURCHASE
            </Button>
          }
        </Section>

        <Section>
          <h2><FormattedMessage {...messages.pending} /></h2>
          <List
            items={listPending}
            headers={['#', 'txHash']}
            noDataMsg="No Pending Transactions"
          />

          <h2><FormattedMessage {...messages.included} /></h2>
          <List
            items={listTxns}
            headers={[
              'TX hash',
              'From',
              'To',
              'Amount',
            ]}
            noDataMsg="No Transactions Yet"
          />
        </Section>
      </Container>
    );
  }
}

const pendingToList = (pending = {}) => (
  Object.keys(pending).map((key) => [key, pending[key].txHash])
);

const txnsToList = (txns, proxyAddr) => {
  if (txns) {
    return Object.keys(txns)
      .filter((key) => txns[key] && txns[key].from && txns[key].to)
      .sort((a, b) => txns[b].blockNumber - txns[a].blockNumber)
      .map((key) => [
        key.substring(2, 8), // txHash
        txns[key].from.substring(2, 8), // from
        txns[key].to.substring(2, 8), // to
        new BigNumber((txns[key].to === proxyAddr) ? txns[key].value : txns[key].value * -1).div(ntzDecimals).toNumber(), // value
      ]);
  }

  return null;
};

Dashboard.propTypes = {
  modalAdd: PropTypes.func,
  transferETH: PropTypes.func,
  claimETH: PropTypes.func,
  proxyEvent: PropTypes.func,
  modalDismiss: PropTypes.func,
  contractEvent: PropTypes.func,
  accountLoaded: PropTypes.func,
  web3Redux: PropTypes.any,
  signerAddr: PropTypes.string,
  account: PropTypes.any,
  privKey: PropTypes.string,
};

const mapStateToProps = createStructuredSelector({
  account: makeSelectAccountData(),
  signerAddr: makeSignerAddrSelector(),
  privKey: makeSelectPrivKey(),
});


function mapDispatchToProps() {
  return {
    modalAdd,
    modalDismiss,
    transferETH,
    proxyEvent,
    claimETH,
    contractEvent: (event) => contractEvent({ event }),
    accountLoaded,
  };
}

export default web3Connect(mapStateToProps, mapDispatchToProps)(Dashboard);
